import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary')}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div style={{ marginTop: '2rem' }}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/quickstart">
            5 分钟快速开始 →
          </Link>
        </div>
      </div>
    </header>
  );
}

function HomepageFeatures() {
  const features = [
    {
      title: 'Master-Slaver 协作',
      icon: '🎯',
      description: '协调实例与执行实例分离，高效并行开发',
    },
    {
      title: '思维框架注入',
      icon: '🧠',
      description: '实例启动时自动加载工作范式，按预设模式工作',
    },
    {
      title: '三级架构',
      icon: '📦',
      description: '从基础版到生产版平滑升级，运行时优雅降级',
    },
    {
      title: 'Skills 系统',
      icon: '🔌',
      description: '可复用的能力单元，支持需求/设计/开发/测试/文档',
    },
    {
      title: '100% 测试覆盖',
      icon: '✅',
      description: '完整的单元测试和集成测试，质量有保障',
    },
    {
      title: 'OpenCLAW 集成',
      icon: '🌉',
      description: '支持远程 Agent 调用，优雅降级',
    },
  ];

  return (
    <section className="features container">
      {features.map((feature, index) => (
        <div key={index} className="feature-card">
          <div className="feature-icon">{feature.icon}</div>
          <div className="feature-title">{feature.title}</div>
          <p className="feature-description">{feature.description}</p>
        </div>
      ))}
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="EKET Framework - AI 智能体协作框架">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
