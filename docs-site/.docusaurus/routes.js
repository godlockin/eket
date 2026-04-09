import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/markdown-page',
    component: ComponentCreator('/markdown-page', '53a'),
    exact: true
  },
  {
    path: '/docs',
    component: ComponentCreator('/docs', '54d'),
    routes: [
      {
        path: '/docs',
        component: ComponentCreator('/docs', 'cac'),
        routes: [
          {
            path: '/docs',
            component: ComponentCreator('/docs', '53a'),
            routes: [
              {
                path: '/docs/api/',
                component: ComponentCreator('/docs/api/', 'b31'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/api/cli',
                component: ComponentCreator('/docs/api/cli', '8e5'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/api/hooks',
                component: ComponentCreator('/docs/api/hooks', 'fee'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/api/http',
                component: ComponentCreator('/docs/api/http', '39e'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/architecture/',
                component: ComponentCreator('/docs/architecture/', 'e79'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/architecture/components',
                component: ComponentCreator('/docs/architecture/components', '2d5'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/architecture/master-slaver',
                component: ComponentCreator('/docs/architecture/master-slaver', '5b8'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/architecture/overview',
                component: ComponentCreator('/docs/architecture/overview', '8f4'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/architecture/three-levels',
                component: ComponentCreator('/docs/architecture/three-levels', '0b2'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/getting-started/',
                component: ComponentCreator('/docs/getting-started/', 'c1b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/getting-started/configuration',
                component: ComponentCreator('/docs/getting-started/configuration', '4f7'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/getting-started/installation',
                component: ComponentCreator('/docs/getting-started/installation', 'f1f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/getting-started/quickstart',
                component: ComponentCreator('/docs/getting-started/quickstart', 'dd9'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/guides/',
                component: ComponentCreator('/docs/guides/', '32a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/guides/commands',
                component: ComponentCreator('/docs/guides/commands', '3b7'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/guides/deployment',
                component: ComponentCreator('/docs/guides/deployment', 'b8f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/guides/skills',
                component: ComponentCreator('/docs/guides/skills', '2f1'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/guides/tasks',
                component: ComponentCreator('/docs/guides/tasks', '826'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/intro',
                component: ComponentCreator('/docs/intro', '69a'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/ops/',
                component: ComponentCreator('/docs/ops/', '4f1'),
                exact: true
              },
              {
                path: '/docs/ops/backup-restore',
                component: ComponentCreator('/docs/ops/backup-restore', '3ad'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/ops/monitoring',
                component: ComponentCreator('/docs/ops/monitoring', 'd9b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/ops/troubleshooting',
                component: ComponentCreator('/docs/ops/troubleshooting', '3ca'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/releases/',
                component: ComponentCreator('/docs/releases/', '68f'),
                exact: true
              },
              {
                path: '/docs/releases/changelog',
                component: ComponentCreator('/docs/releases/changelog', '30e'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/releases/roadmap',
                component: ComponentCreator('/docs/releases/roadmap', '472'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/sop/',
                component: ComponentCreator('/docs/sop/', '503'),
                exact: true
              },
              {
                path: '/docs/sop/master-workflow',
                component: ComponentCreator('/docs/sop/master-workflow', '45f'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/sop/pr-review',
                component: ComponentCreator('/docs/sop/pr-review', '514'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/docs/sop/slaver-workflow',
                component: ComponentCreator('/docs/sop/slaver-workflow', '66a'),
                exact: true,
                sidebar: "docsSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/',
    component: ComponentCreator('/', '2e1'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
