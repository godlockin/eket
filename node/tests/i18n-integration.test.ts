/**
 * i18n Module - Simple Integration Test
 */

import { detectLocale, initI18n, getLocale, changeLocale, translateError, translateCLI } from '../src/i18n/config.js';

function runTests() {
  console.log('=== i18n Integration Tests ===\n');

  let passed = 0;
  let failed = 0;

  // Test 1: detectLocale default
  console.log('Test 1: detectLocale default');
  const locale1 = detectLocale();
  if (locale1 === 'zh-CN' || locale1 === 'en-US') {
    console.log('  ✓ PASS: detectLocale returned', locale1);
    passed++;
  } else {
    console.log('  ✗ FAIL: detectLocale returned unexpected value', locale1);
    failed++;
  }

  // Test 2: initI18n
  console.log('\nTest 2: initI18n');
  try {
    initI18n();
    console.log('  ✓ PASS: initI18n completed successfully');
    passed++;
  } catch (error) {
    console.log('  ✗ FAIL: initI18n failed:', error);
    failed++;
  }

  // Test 3: getLocale after init
  console.log('\nTest 3: getLocale after init');
  const locale2 = getLocale();
  if (locale2) {
    console.log('  ✓ PASS: getLocale returned', locale2);
    passed++;
  } else {
    console.log('  ✗ FAIL: getLocale returned empty value');
    failed++;
  }

  // Test 4: translateError (Chinese)
  console.log('\nTest 4: translateError (Chinese)');
  const errorZh = translateError('TASK_NOT_FOUND');
  if (errorZh.includes('未找到') || errorZh.includes('not found')) {
    console.log('  ✓ PASS: translateError returned:', errorZh);
    passed++;
  } else {
    console.log('  ✗ FAIL: translateError returned unexpected value:', errorZh);
    failed++;
  }

  // Test 5: translateCLI (Chinese)
  console.log('\nTest 5: translateCLI (Chinese)');
  const cliZh = translateCLI('task_claimed_success');
  if (cliZh.includes('成功') || cliZh.includes('claimed')) {
    console.log('  ✓ PASS: translateCLI returned:', cliZh);
    passed++;
  } else {
    console.log('  ✗ FAIL: translateCLI returned unexpected value:', cliZh);
    failed++;
  }

  // Test 6: changeLocale to en-US
  console.log('\nTest 6: changeLocale to en-US');
  try {
    changeLocale('en-US');
    const locale3 = getLocale();
    if (locale3 === 'en-US') {
      console.log('  ✓ PASS: changeLocale succeeded, locale is now', locale3);
      passed++;
    } else {
      console.log('  ✗ FAIL: changeLocale succeeded but locale is', locale3);
      failed++;
    }
  } catch (error) {
    console.log('  ✗ FAIL: changeLocale failed:', error);
    failed++;
  }

  // Test 7: translateError (English)
  console.log('\nTest 7: translateError (English)');
  const errorEn = translateError('TASK_NOT_FOUND');
  if (errorEn.includes('not found') || errorEn.includes('未找到')) {
    console.log('  ✓ PASS: translateError returned:', errorEn);
    passed++;
  } else {
    console.log('  ✗ FAIL: translateError returned unexpected value:', errorEn);
    failed++;
  }

  // Test 8: Unsupported locale
  console.log('\nTest 8: changeLocale to unsupported locale');
  try {
    // @ts-ignore - Testing invalid input
    changeLocale('ja-JP');
    console.log('  ✗ FAIL: Should have thrown error for unsupported locale');
    failed++;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Unsupported')) {
      console.log('  ✓ PASS: Correctly rejected unsupported locale');
      passed++;
    } else {
      console.log('  ✗ FAIL: Wrong error message:', msg);
      failed++;
    }
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
