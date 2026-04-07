/**
 * EKET Framework - Docker Build Skill
 * Version: 0.9.2
 *
 * Docker 构建技能：生成 Dockerfile 和 docker-compose 配置
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * Docker 构建输入
 */
export interface DockerBuildInput {
  /** 项目名称 */
  projectName: string;
  /** 应用类型 */
  appType: 'nodejs' | 'python' | 'java' | 'go' | 'rust' | 'static' | 'custom';
  /** 应用版本 */
  appVersion?: string;
  /** 基础镜像（可选） */
  baseImage?: string;
  /** 应用端口 */
  port?: number;
  /** 工作目录 */
  workDir?: string;
  /** 入口文件 */
  entryPoint?: string;
  /** 是否需要多阶段构建 */
  multiStage?: boolean;
  /** 环境变量 */
  envVars?: Record<string, string>;
  /** 需要挂载的卷 */
  volumes?: string[];
  /** 依赖服务 */
  services?: Array<'postgres' | 'mysql' | 'redis' | 'mongodb' | 'nginx'>;
}

/**
 * Docker 构建输出
 */
export interface DockerBuildOutput {
  /** Dockerfile 内容 */
  dockerfile: string;
  /** docker-compose.yml 内容 */
  dockerCompose: string;
  /** .dockerignore 内容 */
  dockerIgnore: string;
  /** 构建脚本 */
  buildScript: string;
  /** 运行命令 */
  runCommands: {
    build: string;
    run: string;
    stop: string;
    logs: string;
  };
  /** 镜像信息 */
  imageInfo: {
    name: string;
    tag: string;
    estimatedSize: string;
  };
}

/**
 * Docker 构建 Skill 实例
 */
export const DockerBuildSkill: Skill<DockerBuildInput, DockerBuildOutput> = {
  name: 'docker_build',
  description: '生成 Dockerfile 和 docker-compose 配置，支持多阶段构建',
  category: SkillCategory.DEVOPS,
  tags: ['docker', 'container', 'devops', 'deployment'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['projectName', 'appType'],
    properties: {
      projectName: {
        type: 'string',
        description: '项目名称',
      },
      appType: {
        type: 'string',
        enum: ['nodejs', 'python', 'java', 'go', 'rust', 'static', 'custom'],
        description: '应用类型',
      },
      appVersion: {
        type: 'string',
        description: '应用版本',
      },
      baseImage: {
        type: 'string',
        description: '基础镜像',
      },
      port: {
        type: 'number',
        description: '应用端口',
      },
      workDir: {
        type: 'string',
        description: '工作目录',
      },
      entryPoint: {
        type: 'string',
        description: '入口文件',
      },
      multiStage: {
        type: 'boolean',
        description: '是否需要多阶段构建',
      },
      envVars: {
        type: 'object',
        description: '环境变量',
      },
      volumes: {
        type: 'array',
        items: { type: 'string' },
        description: '需要挂载的卷',
      },
      services: {
        type: 'array',
        items: { type: 'string', enum: ['postgres', 'mysql', 'redis', 'mongodb', 'nginx'] },
        description: '依赖服务',
      },
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      dockerfile: { type: 'string' },
      dockerCompose: { type: 'string' },
      dockerIgnore: { type: 'string' },
      runCommands: {
        type: 'object',
        properties: {
          build: { type: 'string' },
          run: { type: 'string' },
          stop: { type: 'string' },
        },
      },
    },
  },

  validateInput(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const req = input as Record<string, unknown>;

    if (!req.projectName || typeof req.projectName !== 'string') {
      return false;
    }

    if (
      !req.appType ||
      !['nodejs', 'python', 'java', 'go', 'rust', 'static', 'custom'].includes(
        req.appType as string
      )
    ) {
      return false;
    }

    if (req.projectName.toString().trim().length === 0) {
      return false;
    }

    return true;
  },

  async execute(input: SkillInput<DockerBuildInput>): Promise<SkillOutput<DockerBuildOutput>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const {
        projectName,
        appType,
        appVersion,
        baseImage,
        port = 3000,
        workDir = '/app',
        entryPoint,
        multiStage = true,
        envVars,
        volumes,
        services,
      } = input.data;

      logs.push(`开始生成 Docker 配置：${projectName}`);

      // 1. 生成 Dockerfile
      const dockerfile = generateDockerfile({
        appType,
        baseImage,
        port,
        workDir,
        entryPoint,
        multiStage,
        envVars,
      });
      logs.push('生成 Dockerfile');

      // 2. 生成 docker-compose.yml
      const dockerCompose = generateDockerCompose({
        projectName,
        appType,
        port,
        volumes,
        services,
        envVars,
      });
      logs.push('生成 docker-compose.yml');

      // 3. 生成 .dockerignore
      const dockerIgnore = generateDockerIgnore(appType);
      logs.push('生成 .dockerignore');

      // 4. 生成构建脚本
      const buildScript = generateBuildScript(projectName, appType);

      // 5. 生成运行命令
      const runCommands = generateRunCommands(projectName);

      // 6. 生成镜像信息
      const imageInfo = generateImageInfo(projectName, appType, appVersion);

      logs.push('Docker 配置生成完成');

      return {
        success: true,
        data: {
          dockerfile,
          dockerCompose,
          dockerIgnore,
          buildScript,
          runCommands,
          imageInfo,
        },
        duration: Date.now() - startTime,
        logs,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logs.push(`错误：${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'DOCKER_GENERATION_FAILED',
        duration: Date.now() - startTime,
        logs,
      };
    }
  },
};

/**
 * 生成 Dockerfile
 */
function generateDockerfile(config: {
  appType: string;
  baseImage?: string;
  port: number;
  workDir: string;
  entryPoint?: string;
  multiStage: boolean;
  envVars?: Record<string, string>;
}): string {
  const { appType, baseImage, port, workDir, entryPoint, multiStage, envVars } = config;

  if (appType === 'nodejs') {
    return generateNodejsDockerfile(baseImage, port, workDir, entryPoint, multiStage, envVars);
  } else if (appType === 'python') {
    return generatePythonDockerfile(baseImage, port, workDir, entryPoint, multiStage, envVars);
  } else if (appType === 'java') {
    return generateJavaDockerfile(baseImage, port, workDir, entryPoint, multiStage, envVars);
  } else if (appType === 'go') {
    return generateGoDockerfile(baseImage, port, workDir, entryPoint, multiStage, envVars);
  }

  // 通用 Dockerfile
  return generateGenericDockerfile(baseImage, port, workDir, entryPoint, envVars);
}

/**
 * 生成 Node.js Dockerfile
 */
function generateNodejsDockerfile(
  baseImage?: string,
  port = 3000,
  workDir = '/app',
  entryPoint?: string,
  multiStage = true,
  envVars?: Record<string, string>
): string {
  const fromImage = baseImage || 'node:20-alpine';

  if (multiStage) {
    return `# Build stage
FROM ${fromImage} AS builder

WORKDIR ${workDir}

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM ${fromImage} AS production

WORKDIR ${workDir}

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \\
    npm cache clean --force

# Copy built artifacts from builder
COPY --from=builder ${workDir}/dist ./dist
COPY --from=builder ${workDir}/node_modules ./node_modules

# Set ownership
RUN chown -R nodejs:nodejs ${workDir}

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node -e "console.log('OK')"

# Set entry point
ENTRYPOINT ["node"]
CMD ["${entryPoint || 'dist/index.js'}"]
`;
  } else {
    return `FROM ${fromImage}

WORKDIR ${workDir}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \\
    npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001 && \\
    chown -R nodejs:nodejs ${workDir}

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node -e "console.log('OK')"

# Set entry point
ENTRYPOINT ["node"]
CMD ["${entryPoint || 'index.js'}"]
`;
  }
}

/**
 * 生成 Python Dockerfile
 */
function generatePythonDockerfile(
  baseImage?: string,
  port = 8000,
  workDir = '/app',
  entryPoint?: string,
  multiStage = true,
  envVars?: Record<string, string>
): string {
  const fromImage = baseImage || 'python:3.11-slim';

  if (multiStage) {
    return `# Build stage
FROM ${fromImage} AS builder

WORKDIR ${workDir}

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --user --no-cache-dir -r requirements.txt

# Production stage
FROM ${fromImage}

WORKDIR ${workDir}

# Create non-root user
RUN useradd -m -u 1001 appuser

# Copy installed packages from builder
COPY --from=builder /root/.local /home/appuser/.local
COPY --from=builder ${workDir} ${workDir}

# Set path
ENV PATH=/home/appuser/.local/bin:\$PATH

# Set ownership
RUN chown -R appuser:appuser ${workDir}

# Switch to non-root user
USER appuser

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD python -c "print('OK')"

# Set entry point
ENTRYPOINT ["python"]
CMD ["${entryPoint || 'main.py'}"]
`;
  } else {
    return `FROM ${fromImage}

WORKDIR ${workDir}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create non-root user
RUN useradd -m -u 1001 appuser && \\
    chown -R appuser:appuser ${workDir}

# Switch to non-root user
USER appuser

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD python -c "print('OK')"

# Set entry point
ENTRYPOINT ["python"]
CMD ["${entryPoint || 'main.py'}"]
`;
  }
}

/**
 * 生成 Java Dockerfile
 */
function generateJavaDockerfile(
  baseImage?: string,
  port = 8080,
  workDir = '/app',
  _entryPoint?: string,
  multiStage = true,
  envVars?: Record<string, string>
): string {
  const buildImage = baseImage || 'maven:3.9-eclipse-temurin-17';
  const runImage =
    baseImage?.replace('maven', 'eclipse-temurin') || 'eclipse-temurin:17-jre-alpine';

  if (multiStage) {
    return `# Build stage
FROM ${buildImage} AS builder

WORKDIR ${workDir}

# Copy pom.xml/build.gradle
COPY pom.xml .

# Download dependencies
RUN mvn dependency:go-offline

# Copy source code
COPY src ./src

# Build the application
RUN mvn clean package -DskipTests

# Production stage
FROM ${runImage}

WORKDIR ${workDir}

# Create non-root user
RUN addgroup -g 1001 -S java && \\
    adduser -S java -u 1001

# Copy built jar from builder
COPY --from=builder ${workDir}/target/*.jar app.jar

# Set ownership
RUN chown -R java:java ${workDir}

# Switch to non-root user
USER java

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# JVM options
ENV JAVA_OPTS="-Xmx512m -Xms256m"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \\
  CMD wget -qO- http://localhost:${port}/actuator/health || exit 1

# Run the application
ENTRYPOINT ["sh", "-c", "java \$JAVA_OPTS -jar app.jar"]
`;
  } else {
    return `FROM ${buildImage}

WORKDIR ${workDir}

COPY pom.xml .
RUN mvn dependency:go-offline

COPY src ./src
RUN mvn clean package -DskipTests

# Create non-root user
RUN addgroup -g 1001 -S java && \\
    adduser -S java -u 1001 && \\
    chown -R java:java ${workDir}

USER java

EXPOSE ${port}

${generateEnvVars(envVars)}

ENV JAVA_OPTS="-Xmx512m -Xms256m"

ENTRYPOINT ["sh", "-c", "java \$JAVA_OPTS -jar target/*.jar"]
`;
  }
}

/**
 * 生成 Go Dockerfile
 */
function generateGoDockerfile(
  baseImage?: string,
  port = 8080,
  workDir = '/app',
  _entryPoint?: string,
  multiStage = true,
  envVars?: Record<string, string>
): string {
  const buildImage = baseImage || 'golang:1.21-alpine';

  if (multiStage) {
    return `# Build stage
FROM ${buildImage} AS builder

WORKDIR ${workDir}

# Install ca-certificates
RUN apk add --no-cache git ca-certificates

# Copy go.mod and go.sum
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Production stage
FROM alpine:latest

WORKDIR ${workDir}

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S app && \\
    adduser -S app -u 1001

# Copy binary from builder
COPY --from=builder ${workDir}/main .

# Set ownership
RUN chown -R app:app ${workDir}

# Switch to non-root user
USER app

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget -qO- http://localhost:${port}/health || exit 1

# Run the application
ENTRYPOINT ["./main"]
`;
  } else {
    return `FROM ${buildImage}

WORKDIR ${workDir}

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

RUN addgroup -g 1001 -S app && \\
    adduser -S app -u 1001 && \\
    chown -R app:app ${workDir}

USER app

EXPOSE ${port}

${generateEnvVars(envVars)}

ENTRYPOINT ["./main"]
`;
  }
}

/**
 * 生成通用 Dockerfile
 */
function generateGenericDockerfile(
  baseImage?: string,
  port = 3000,
  workDir = '/app',
  entryPoint?: string,
  envVars?: Record<string, string>
): string {
  const fromImage = baseImage || 'alpine:latest';

  return `FROM ${fromImage}

WORKDIR ${workDir}

# Copy application files
COPY . .

# Install dependencies (customize as needed)
# RUN apk add --no-cache <dependencies>

# Build (if needed)
# RUN make build

# Create non-root user
RUN addgroup -g 1001 -S app && \\
    adduser -S app -u 1001 && \\
    chown -R app:app ${workDir}

# Switch to non-root user
USER app

# Expose port
EXPOSE ${port}

# Set environment variables
${generateEnvVars(envVars)}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget -qO- http://localhost:${port}/health || exit 1

# Set entry point
ENTRYPOINT ["${entryPoint || './start.sh'}"]
`;
}

/**
 * 生成环境变量配置
 */
function generateEnvVars(envVars?: Record<string, string>): string {
  if (!envVars || Object.keys(envVars).length === 0) {
    return '';
  }

  return Object.entries(envVars)
    .map(([key, value]) => `ENV ${key}=${value}`)
    .join('\n');
}

/**
 * 生成 docker-compose.yml
 */
function generateDockerCompose(config: {
  projectName: string;
  appType: string;
  port: number;
  volumes?: string[];
  services?: string[];
  envVars?: Record<string, string>;
}): string {
  const { projectName, port, volumes, services, envVars } = config;
  const serviceName = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  let compose = `version: '3.8'\n\n`;
  compose += `services:\n`;

  // 主应用服务
  compose += `  ${serviceName}:\n`;
  compose += `    build:\n`;
  compose += `      context: .\n`;
  compose += `      dockerfile: Dockerfile\n`;
  compose += `    container_name: ${serviceName}\n`;
  compose += `    ports:\n`;
  compose += `      - "${port}:${port}"\n`;

  // 环境变量
  if (envVars) {
    compose += `    environment:\n`;
    for (const [key, value] of Object.entries(envVars)) {
      compose += `      - ${key}=${value}\n`;
    }
  }

  // 卷挂载
  if (volumes && volumes.length > 0) {
    compose += `    volumes:\n`;
    for (const vol of volumes) {
      compose += `      - ${vol}\n`;
    }
  }

  // 依赖服务
  if (services && services.length > 0) {
    compose += `    depends_on:\n`;
    for (const svc of services) {
      compose += `      - ${svc}\n`;
    }
  }

  // 健康检查
  compose += `    healthcheck:\n`;
  compose += `      test: ["CMD", "wget", "-qO-", "http://localhost:${port}/health"]\n`;
  compose += `      interval: 30s\n`;
  compose += `      timeout: 3s\n`;
  compose += `      retries: 3\n`;
  compose += `      start_period: 10s\n`;

  compose += `\n`;

  // 添加依赖服务
  if (services) {
    for (const svc of services) {
      compose += generateServiceConfig(svc);
    }
  }

  // 添加 networks 和 volumes
  compose += `\nnetworks:\n`;
  compose += `  default:\n`;
  compose += `    driver: bridge\n`;

  return compose;
}

/**
 * 生成服务配置
 */
function generateServiceConfig(service: string): string {
  const configs: Record<string, string> = {
    postgres: `  postgres:\n    image: postgres:15-alpine\n    container_name: postgres\n    environment:\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n      POSTGRES_DB: app\n    ports:\n      - "5432:5432"\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\n`,

    mysql: `  mysql:\n    image: mysql:8.0\n    container_name: mysql\n    environment:\n      MYSQL_ROOT_PASSWORD: rootpassword\n      MYSQL_DATABASE: app\n      MYSQL_USER: appuser\n      MYSQL_PASSWORD: apppassword\n    ports:\n      - "3306:3306"\n    volumes:\n      - mysql_data:/var/lib/mysql\n    healthcheck:\n      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\n`,

    redis: `  redis:\n    image: redis:7-alpine\n    container_name: redis\n    ports:\n      - "6379:6379"\n    volumes:\n      - redis_data:/data\n    healthcheck:\n      test: ["CMD", "redis-cli", "ping"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\n`,

    mongodb: `  mongodb:\n    image: mongo:7\n    container_name: mongodb\n    environment:\n      MONGO_INITDB_ROOT_USERNAME: root\n      MONGO_INITDB_ROOT_PASSWORD: rootpassword\n      MONGO_INITDB_DATABASE: app\n    ports:\n      - "27017:27017"\n    volumes:\n      - mongodb_data:/data/db\n    healthcheck:\n      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\n`,

    nginx: `  nginx:\n    image: nginx:alpine\n    container_name: nginx\n    ports:\n      - "80:80"\n      - "443:443"\n    volumes:\n      - ./nginx.conf:/etc/nginx/nginx.conf:ro\n      - ./static:/usr/share/nginx/static:ro\n    depends_on:\n      - ${service}\n    healthcheck:\n      test: ["CMD", "wget", "-qO-", "http://localhost/health"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n\n`,
  };

  return configs[service] || '';
}

/**
 * 生成 .dockerignore
 */
function generateDockerIgnore(appType: string): string {
  const common = `# Git
.git
.gitignore
.gitattributes

# Documentation
README.md
*.md
docs/

# IDE
.idea/
.vscode/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Environment
.env
.env.local
.env.*.local

# Test
coverage/
.nyc_output/

# Build output
dist/
build/
*.egg-info/
`;

  const nodejsExtra = `# Node.js
node_modules/
npm-debug.log
yarn-error.log
`;

  const pythonExtra = `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/
`;

  const javaExtra = `# Java
target/
*.class
*.jar
*.war
.mvn/
`;

  let extra = common;

  switch (appType) {
    case 'nodejs':
      extra += nodejsExtra;
      break;
    case 'python':
      extra += pythonExtra;
      break;
    case 'java':
      extra += javaExtra;
      break;
    default:
      extra += `# Add your ignore patterns here\n`;
  }

  return extra;
}

/**
 * 生成构建脚本
 */
function generateBuildScript(projectName: string, _appType: string): string {
  const name = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  return `#!/bin/bash
# Build script for ${projectName}

set -e

echo "Building ${projectName}..."

# Build Docker image
docker build -t ${name}:latest .

# Optional: Build for specific platform
# docker build --platform linux/amd64 -t ${name}:latest .

echo "Build completed successfully!"
echo ""
echo "Run the following commands:"
echo "  docker run -p 3000:3000 ${name}:latest"
echo "  docker logs -f <container_id>"
`;
}

/**
 * 生成运行命令
 */
function generateRunCommands(projectName: string): {
  build: string;
  run: string;
  stop: string;
  logs: string;
} {
  const name = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  return {
    build: `docker build -t ${name}:latest .`,
    run: `docker run -d -p 3000:3000 --name ${name} ${name}:latest`,
    stop: `docker stop ${name} && docker rm ${name}`,
    logs: `docker logs -f ${name}`,
  };
}

/**
 * 生成镜像信息
 */
function generateImageInfo(
  projectName: string,
  appType: string,
  appVersion?: string
): {
  name: string;
  tag: string;
  estimatedSize: string;
} {
  const name = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const version = appVersion || 'latest';

  const sizeEstimates: Record<string, string> = {
    nodejs: '~150MB (multi-stage), ~800MB (single-stage)',
    python: '~200MB (multi-stage), ~900MB (single-stage)',
    java: '~200MB (multi-stage), ~700MB (single-stage)',
    go: '~10MB (multi-stage), ~800MB (single-stage)',
    rust: '~15MB (multi-stage), ~1GB (single-stage)',
    static: '~5MB',
    custom: '~100MB (estimated)',
  };

  return {
    name,
    tag: version,
    estimatedSize: sizeEstimates[appType] || '~100MB',
  };
}

/**
 * 默认导出
 */
export default DockerBuildSkill;
