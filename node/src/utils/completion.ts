/**
 * EKET Framework CLI - Shell Completion Generator
 *
 * Generates bash/zsh completion scripts for commander commands.
 *
 * Usage:
 *   eket-cli completion bash    # Generate bash completion
 *   eket-cli completion zsh     # Generate zsh completion
 */

import { Command } from 'commander';

/**
 * Bash completion script template for EKET CLI
 */
const BASH_COMPLETION = `# EKET CLI Bash Completion
# Source this file in your .bashrc: source <(eket-cli completion bash)

_eket_cli_completion() {
    local cur_word="\${COMP_WORDS[COMP_CWORD]}"
    local prev_word="\${COMP_WORDS[COMP_CWORD-1]}"
    local commands="redis:check redis:list-slavers sqlite:check sqlite:list-retros sqlite:search sqlite:report system:check system:doctor project:init instance:start instance:set-role task:claim submit-pr team-status recommend dependency:analyze web:dashboard hooks:start gateway:start pool:status pool:select heartbeat:start heartbeat:status queue:test interactive:start"

    # Complete commands
    if [ \$COMP_CWORD -eq 1 ]; then
        COMPREPLY=( \$(compgen -W "\$commands" -- "\$cur_word") )
        return
    fi

    # Complete options for specific commands
    case "\$prev_word" in
        -p|--port|--host|-H)
            return
            ;;
        -r|--role)
            COMPREPLY=( \$(compgen -W "product_manager architect tech_manager doc_monitor frontend_dev backend_dev qa_engineer devops_engineer designer tester fullstack" -- "\$cur_word") )
            return
            ;;
        --human|--auto)
            return
            ;;
    esac

    # Complete options
    if [[ "\$cur_word" == -* ]]; then
        COMPREPLY=( \$(compgen -W "-h --help -p --port -H --host -r --role --human --auto --list-roles" -- "\$cur_word") )
    fi
}

complete -F _eket_cli_completion eket-cli
complete -F _eket_cli_completion node
`;

/**
 * Zsh completion script template for EKET CLI
 */
const ZSH_COMPLETION = `# EKET CLI Zsh Completion
# Source this file in your .zshrc: source <(eket-cli completion zsh)

_eket_cli() {
    local -a commands
    local -a options

    commands=(
        'redis:check:Check Redis connection status'
        'redis:list-slavers:List all active Slavers'
        'sqlite:check:Check SQLite database status'
        'sqlite:list-retros:List all Retrospectives'
        'sqlite:search:Search Retrospectives by keyword'
        'sqlite:report:Generate Retrospective statistics report'
        'system:check:Check Node.js module availability'
        'system:doctor:Diagnose system status'
        'project:init:Project initialization wizard'
        'instance:start:Start an instance (Master or Slaver mode)'
        'instance:set-role:Set agent role'
        'task:claim:Claim a task'
        'submit-pr:Submit a pull request'
        'team-status:Show team status'
        'recommend:Get recommendations'
        'dependency:analyze:Analyze dependencies'
        'web:dashboard:Start Web monitoring dashboard'
        'hooks:start:Start HTTP Hook server'
        'gateway:start:Start OpenCLAW API Gateway'
        'pool:status:View Agent Pool status'
        'pool:select:Select the best suited agent'
        'heartbeat:start:Start Slaver heartbeat'
        'heartbeat:status:View Slaver heartbeat status'
        'queue:test:Test message queue functionality'
        'interactive:start:Start an instance with interactive wizard'
    )

    options=(
        '-h[Show help]'
        '--help[Show help]'
        '-p[Port number]:PORT'
        '--port[Port number]:PORT'
        '-H[Host address]:HOST'
        '--host[Host address]:HOST'
        '-r[Agent role]:ROLE'
        '--role[Agent role]:ROLE'
        '--human[Human-controlled instance]'
        '--auto[AI auto mode]'
        '--list-roles[List available roles]'
    )

    _describe 'commands' commands
    _describe 'options' options

    # Role values
    if [[ $words[$CURRENT-1] == *role ]]; then
        local -a roles
        roles=(
            'product_manager:Product Manager'
            'architect:Architect'
            'tech_manager:Tech Manager'
            'doc_monitor:Document Monitor'
            'frontend_dev:Frontend Developer'
            'backend_dev:Backend Developer'
            'qa_engineer:QA Engineer'
            'devops_engineer:DevOps Engineer'
            'designer:Designer'
            'tester:Tester'
            'fullstack:Fullstack Developer'
        )
        _describe 'roles' roles
    fi
}

compdef _eket_cli eket-cli
`;

/**
 * Generate completion script for specified shell
 */
export function generateCompletion(shell: 'bash' | 'zsh'): string {
  switch (shell) {
    case 'bash':
      return BASH_COMPLETION;
    case 'zsh':
      return ZSH_COMPLETION;
    default:
      throw new Error(`Unsupported shell: ${shell}. Use 'bash' or 'zsh'.`);
  }
}

/**
 * Register completion command with program
 */
export function registerCompletion(program: Command): void {
  program
    .command('completion')
    .description('Generate shell completion scripts')
    .argument('<shell>', 'Shell type (bash or zsh)')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli completion bash              # Generate bash completion
  $ eket-cli completion zsh               # Generate zsh completion

Setup Instructions:

Bash:
  # Add to ~/.bashrc:
  source <(eket-cli completion bash)

  # Or save to file and source:
  eket-cli completion bash > /etc/bash_completion.d/eket-cli

Zsh:
  # Add to ~/.zshrc:
  source <(eket-cli completion zsh)

  # Or save to fpath:
  eket-cli completion zsh > /usr/local/share/zsh/site-functions/_eket-cli
  echo 'fpath=(/usr/local/share/zsh/site-functions $fpath)' >> ~/.zshrc

After setup:
  - Restart your shell or run: source ~/.bashrc (or ~/.zshrc)
  - Type 'eket-cli [TAB]' to see completions
`
    )
    .action((shell: string) => {
      if (shell !== 'bash' && shell !== 'zsh') {
        console.error(`Error: Unsupported shell '${shell}'`);
        console.error('Use "bash" or "zsh"');
        process.exit(1);
      }

      const completion = generateCompletion(shell as 'bash' | 'zsh');
      console.log(completion);
    });
}
