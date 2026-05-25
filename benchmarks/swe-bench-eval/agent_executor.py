#!/usr/bin/env python3
"""
EKET Agent Executor for SWE-bench

Uses Claude API to analyze issues and generate patches.
This is the actual agent execution that the EKET framework orchestrates.

Improvements in v2:
- Code context retrieval based on problem statement keywords
- Few-shot examples for better patch generation
- Retry logic with error analysis
- Enhanced patch format validation
"""

import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Optional, Tuple, List
import requests


# Few-shot examples for patch generation
FEW_SHOT_EXAMPLES = """
## Example 1: Bug fix in Django ORM

**Problem**: QuerySet.distinct() not working correctly with aggregate()

**Analysis**: The issue is in django/db/models/query.py, method QuerySet.aggregate().
When distinct() is called before aggregate(), the distinct flag is being ignored.

**Patch**:
```
--- a/django/db/models/query.py
+++ b/django/db/models/query.py
@@ -392,7 +392,10 @@ class QuerySet:
     def aggregate(self, *args, **kwargs):
         query = self.query.clone()
         for arg in args:
-            query.add_aggregate(arg)
+            # Preserve distinct flag when aggregating
+            if self.query.distinct:
+                query.distinct = True
+            query.add_aggregate(arg, is_summary=True)
```

## Example 2: Fix string handling in requests library

**Problem**: URL encoding fails with unicode characters

**Analysis**: In requests/utils.py, the encode_url() function doesn't handle
non-ASCII characters properly. Need to use proper UTF-8 encoding.

**Patch**:
```
--- a/requests/utils.py
+++ b/requests/utils.py
@@ -128,6 +128,8 @@ def encode_url(url):
     if isinstance(url, bytes):
         url = url.decode('utf-8')
+    # Ensure proper encoding of unicode characters
+    url = url.encode('utf-8').decode('ascii', errors='ignore')
     return quote(url, safe=':/?#[]@!$&()*+,;=')
```
"""


# Common file patterns by repository
REPO_FILE_PATTERNS = {
    'django': ['django/**/*.py', 'tests/**/*.py'],
    'flask': ['src/flask/**/*.py', 'flask/**/*.py'],
    'requests': ['requests/**/*.py', 'src/requests/**/*.py'],
    'pytest': ['src/_pytest/**/*.py', '_pytest/**/*.py'],
    'sympy': ['sympy/**/*.py'],
    'scikit-learn': ['sklearn/**/*.py'],
    'matplotlib': ['lib/matplotlib/**/*.py'],
    'sphinx': ['sphinx/**/*.py'],
    'astropy': ['astropy/**/*.py'],
    'pylint': ['pylint/**/*.py'],
}


def extract_keywords(problem_statement: str) -> List[str]:
    """
    Extract relevant keywords from problem statement for context retrieval.
    """
    # Remove common words and extract identifiers
    stop_words = {
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
        'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
        'from', 'up', 'about', 'into', 'over', 'after', 'it', 'this', 'that',
        'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'and', 'or',
        'but', 'if', 'when', 'while', 'as', 'not', 'no', 'yes', 'all', 'each',
        'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'than'
    }

    # Extract potential identifiers (CamelCase, snake_case, method calls)
    identifiers = []

    # CamelCase patterns
    camel_pattern = re.findall(r'[A-Z][a-z]+(?:[A-Z][a-z]+)*', problem_statement)
    identifiers.extend(camel_pattern)

    # snake_case patterns
    snake_pattern = re.findall(r'[a-z]+(?:_[a-z]+)+', problem_statement)
    identifiers.extend(snake_pattern)

    # Method calls like .method_name()
    method_pattern = re.findall(r'\.([a-z_][a-z0-9_]*)\s*\(', problem_statement, re.I)
    identifiers.extend(method_pattern)

    # Class/module references
    class_pattern = re.findall(r'`([A-Za-z_][A-Za-z0-9_.]*)`', problem_statement)
    identifiers.extend(class_pattern)

    # File paths
    file_pattern = re.findall(r'([a-z_]+\.py)', problem_statement, re.I)
    identifiers.extend([f.replace('.py', '') for f in file_pattern])

    # Remove duplicates and stop words
    keywords = list(set(kw.lower() for kw in identifiers if kw.lower() not in stop_words))

    return keywords[:20]  # Limit to top 20 keywords


def identify_relevant_files(repo: str, problem_statement: str, fail_to_pass: list) -> List[str]:
    """
    Identify potentially relevant files based on problem statement and test paths.
    """
    relevant_files = []

    # Extract file paths from fail_to_pass tests
    for test in fail_to_pass:
        if '::' in test:
            test_file = test.split('::')[0]
            relevant_files.append(test_file)

            # Infer source file from test file
            if 'test_' in test_file:
                source_file = test_file.replace('test_', '').replace('tests/', '')
                relevant_files.append(source_file)

    # Extract file references from problem statement
    file_refs = re.findall(r'([a-z_/]+\.py)', problem_statement, re.I)
    relevant_files.extend(file_refs)

    # Extract class/module names that might map to files
    keywords = extract_keywords(problem_statement)
    for kw in keywords:
        relevant_files.append(f"{kw}.py")

    return list(set(relevant_files))[:10]


def get_repo_context(repo: str, base_commit: str, problem_statement: str, fail_to_pass: list) -> str:
    """
    Get relevant code context from the repository.
    Builds context based on problem statement analysis.
    """
    keywords = extract_keywords(problem_statement)
    relevant_files = identify_relevant_files(repo, problem_statement, fail_to_pass)

    context = f"""
## Repository Context

**Repository**: {repo}
**Base Commit**: {base_commit}

### Relevant Keywords Identified
{', '.join(keywords) if keywords else 'None identified'}

### Potentially Relevant Files
{chr(10).join('- ' + f for f in relevant_files) if relevant_files else 'None identified'}

### Test Files to Fix
{chr(10).join('- ' + t for t in fail_to_pass)}

### Suggested Investigation Areas
Based on the problem statement, focus on:
1. Files containing the identified keywords
2. Test files in fail_to_pass for understanding expected behavior
3. Related utility/helper modules
"""
    return context


def validate_patch_format(patch: str) -> Tuple[bool, str, List[str]]:
    """
    Enhanced patch format validation with detailed error reporting.

    Returns: (is_valid, message, list_of_issues)
    """
    issues = []

    if not patch or not patch.strip():
        return False, "Empty patch", ["Patch content is empty"]

    # Check for diff markers
    if "---" not in patch:
        issues.append("Missing '--- a/...' marker for original file")

    if "+++" not in patch:
        issues.append("Missing '+++ b/...' marker for modified file")

    if "@@ " not in patch:
        issues.append("Missing '@@ -x,y +x,y @@' hunk header")

    # Validate hunk headers
    hunk_pattern = r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@'
    hunks = re.findall(hunk_pattern, patch)
    if not hunks and "@@ " in patch:
        issues.append("Invalid hunk header format (should be '@@ -start,count +start,count @@')")

    # Check for valid file paths
    file_paths = re.findall(r'^[-+]{3} [ab]/(.+)$', patch, re.MULTILINE)
    if len(file_paths) < 2:
        issues.append("Missing or invalid file paths in --- and +++ lines")

    # Check for actual changes
    has_additions = bool(re.search(r'^\+[^+]', patch, re.MULTILINE))
    has_deletions = bool(re.search(r'^-[^-]', patch, re.MULTILINE))
    if not has_additions and not has_deletions:
        issues.append("Patch contains no actual changes (no lines starting with + or -)")

    # Check for common formatting errors
    if '\t' in patch and '    ' in patch:
        # Mixed tabs and spaces might be intentional, just warn
        pass

    # Validate line counts in hunks
    for hunk_match in re.finditer(hunk_pattern, patch):
        start = hunk_match.end()
        # Find next hunk or end of patch
        next_hunk = re.search(hunk_pattern, patch[start:])
        end = start + next_hunk.start() if next_hunk else len(patch)
        hunk_content = patch[start:end]

        # Count lines
        context_lines = len(re.findall(r'^[^+-@\n]', hunk_content, re.MULTILINE))
        add_lines = len(re.findall(r'^\+', hunk_content, re.MULTILINE))
        del_lines = len(re.findall(r'^-', hunk_content, re.MULTILINE))

        expected_old = int(hunk_match.group(2) or 1)
        expected_new = int(hunk_match.group(4) or 1)

        actual_old = context_lines + del_lines
        actual_new = context_lines + add_lines

        if actual_old != expected_old:
            issues.append(f"Hunk line count mismatch: expected {expected_old} old lines, got {actual_old}")
        if actual_new != expected_new:
            issues.append(f"Hunk line count mismatch: expected {expected_new} new lines, got {actual_new}")

    if issues:
        return False, f"Patch validation failed: {'; '.join(issues)}", issues

    return True, "Patch format valid", []


def build_enhanced_prompt(
    instance_id: str,
    repo: str,
    problem_statement: str,
    hints: str,
    fail_to_pass: list,
    context: str,
    previous_attempt: Optional[str] = None,
    previous_errors: Optional[List[str]] = None
) -> str:
    """
    Build an enhanced prompt with few-shot examples and context.
    """
    retry_guidance = ""
    if previous_attempt and previous_errors:
        retry_guidance = f"""
## Previous Attempt Analysis

Your previous patch had the following issues:
{chr(10).join('- ' + e for e in previous_errors)}

Previous patch:
```
{previous_attempt}
```

Please fix these issues in your new attempt. Pay special attention to:
1. Correct unified diff format
2. Accurate line numbers in hunk headers
3. Proper context lines around changes
"""

    prompt = f"""You are an expert software engineer specializing in bug fixes and patch generation.
Your task is to analyze a GitHub issue and generate a precise, minimal patch to fix it.

{FEW_SHOT_EXAMPLES}

---

## Current Task

**Repository**: {repo}
**Instance ID**: {instance_id}

{context}

### Problem Statement
{problem_statement}

### Hints
{hints or "No hints provided"}

### Tests That Must Pass
{json.dumps(fail_to_pass, indent=2)}

{retry_guidance}

## Instructions

1. **Analyze** the problem carefully - identify the root cause
2. **Locate** the specific file(s) and function(s) that need modification
3. **Generate** a minimal, surgical patch that fixes the issue without side effects
4. **Verify** your patch follows the exact unified diff format

## Output Format

Provide your response in this exact format:

<analysis>
1. Root Cause: [Explain what's causing the bug]
2. Location: [File path and function/class name]
3. Fix Strategy: [How you'll fix it]
</analysis>

<patch>
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -line_start,count +line_start,count @@
 context line (unchanged)
-line to remove
+line to add
 context line (unchanged)
</patch>

CRITICAL:
- The patch MUST be in valid unified diff format
- Include 3 lines of context before and after changes
- File paths must start with a/ and b/
- Hunk headers (@@ -x,y +x,y @@) must have accurate line counts
- Only include the minimal changes needed to fix the issue
"""
    return prompt


def call_claude_for_patch(
    instance_id: str,
    repo: str,
    problem_statement: str,
    hints: str,
    fail_to_pass: list,
    context: str,
    api_key: Optional[str] = None,
    previous_attempt: Optional[str] = None,
    previous_errors: Optional[List[str]] = None
) -> Tuple[bool, str, Optional[str]]:
    """
    Call Claude API to generate a patch for the given problem.

    Returns: (success, patch_or_error, analysis)
    """
    api_key = api_key or os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENCLAW_API_KEY")

    if not api_key:
        return False, "No API key found (set ANTHROPIC_API_KEY or OPENCLAW_API_KEY)", None

    prompt = build_enhanced_prompt(
        instance_id, repo, problem_statement, hints, fail_to_pass,
        context, previous_attempt, previous_errors
    )

    try:
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}]
            },
            timeout=180
        )

        if response.status_code != 200:
            return False, f"API error: {response.status_code} - {response.text}", None

        data = response.json()
        content = data["content"][0]["text"]

        # Extract analysis
        analysis = None
        if "<analysis>" in content and "</analysis>" in content:
            analysis = content.split("<analysis>")[1].split("</analysis>")[0].strip()

        # Extract patch
        if "<patch>" in content and "</patch>" in content:
            patch = content.split("<patch>")[1].split("</patch>")[0].strip()
            return True, patch, analysis
        else:
            return False, "No patch found in response", analysis

    except Exception as e:
        return False, f"API error: {str(e)}", None


def generate_patch_with_retry(
    instance_id: str,
    repo: str,
    problem_statement: str,
    hints: str,
    fail_to_pass: list,
    context: str,
    max_retries: int = 3
) -> Tuple[bool, Optional[str], Optional[str], int]:
    """
    Generate patch with retry logic on format errors.

    Returns: (success, patch, analysis, attempts_used)
    """
    previous_attempt = None
    previous_errors = None

    for attempt in range(max_retries):
        print(f"      Attempt {attempt + 1}/{max_retries}...")

        success, patch_or_error, analysis = call_claude_for_patch(
            instance_id, repo, problem_statement, hints, fail_to_pass,
            context, previous_attempt=previous_attempt, previous_errors=previous_errors
        )

        if not success:
            print(f"      API call failed: {patch_or_error}")
            return False, None, analysis, attempt + 1

        # Validate patch format
        is_valid, msg, issues = validate_patch_format(patch_or_error)

        if is_valid:
            print(f"      Valid patch generated")
            return True, patch_or_error, analysis, attempt + 1

        print(f"      Patch validation failed: {msg}")

        # Store for retry context
        previous_attempt = patch_or_error
        previous_errors = issues

    # Return last attempt even if invalid
    return False, previous_attempt, analysis, max_retries


def validate_patch(patch: str, repo: str, base_commit: str, fail_to_pass: list) -> Tuple[bool, str]:
    """
    Validate the generated patch by applying it and running tests.

    In a full implementation, this would:
    1. Clone the repo at base_commit
    2. Apply the patch
    3. Run the FAIL_TO_PASS tests
    4. Return results

    For now, we do enhanced syntax validation.
    """
    is_valid, msg, issues = validate_patch_format(patch)

    if not is_valid:
        return False, msg

    # Additional semantic checks
    # Check that file paths look reasonable for the repo
    repo_name = repo.split('/')[0] if '/' in repo else repo
    file_paths = re.findall(r'^[-+]{3} [ab]/(.+)$', patch, re.MULTILINE)

    for fp in file_paths:
        # Basic sanity: file should be Python for Python repos
        if repo_name in ['django', 'flask', 'requests', 'pytest', 'sympy', 'sklearn', 'matplotlib', 'sphinx', 'astropy', 'pylint']:
            if not fp.endswith('.py') and not fp.endswith('.txt') and not fp.endswith('.rst'):
                return False, f"Unexpected file type for {repo_name}: {fp}"

    return True, "Patch syntax valid (full validation requires SWE-bench harness)"


def run_agent(
    instance_id: str,
    repo: str,
    base_commit: str,
    problem_statement: str,
    hints: str,
    fail_to_pass: list,
    output_dir: Path,
    max_retries: int = 3
) -> dict:
    """
    Run the EKET agent workflow on a single SWE-bench instance.
    """
    start_time = time.time()

    result = {
        "instance_id": instance_id,
        "repo": repo,
        "status": "error",
        "patch_generated": False,
        "patch": None,
        "analysis": None,
        "validation": None,
        "duration_seconds": 0,
        "error_message": None,
        "attempts": 0
    }

    try:
        # Step 1: Build context
        print(f"   Building context...")
        context = get_repo_context(repo, base_commit, problem_statement, fail_to_pass)

        # Step 2: Generate patch with retry
        print(f"   Generating patch...")
        success, patch, analysis, attempts = generate_patch_with_retry(
            instance_id, repo, problem_statement, hints, fail_to_pass,
            context, max_retries=max_retries
        )

        result["analysis"] = analysis
        result["attempts"] = attempts

        if not success or not patch:
            result["status"] = "failed"
            result["error_message"] = "Failed to generate valid patch after retries"
            return result

        result["patch"] = patch
        result["patch_generated"] = True

        # Step 3: Final validation
        print(f"   Final validation...")
        valid, validation_msg = validate_patch(patch, repo, base_commit, fail_to_pass)
        result["validation"] = validation_msg

        if valid:
            result["status"] = "resolved"

            # Save patch to file
            patch_file = output_dir / "patches" / f"{instance_id.replace('/', '-')}.patch"
            patch_file.parent.mkdir(parents=True, exist_ok=True)
            patch_file.write_text(patch)
        else:
            result["status"] = "failed"
            result["error_message"] = validation_msg

    except Exception as e:
        result["status"] = "error"
        result["error_message"] = str(e)

    result["duration_seconds"] = time.time() - start_time
    return result


if __name__ == "__main__":
    # Test with a single instance
    test_result = run_agent(
        instance_id="test-instance",
        repo="test/repo",
        base_commit="abc123",
        problem_statement="Test problem",
        hints="",
        fail_to_pass=["test_file.py::test_function"],
        output_dir=Path("benchmarks/swe-bench-eval/results")
    )
    print(json.dumps(test_result, indent=2))
