import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    'quickstart',
    {
      type: 'category',
      label: '核心概念',
      items: ['architecture', 'master-slaver', 'skills'],
    },
    {
      type: 'category',
      label: '使用指南',
      items: ['cli-reference', 'configuration'],
    },
  ],
};

export default sidebars;
