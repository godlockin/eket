"""
EKET SDK for Python - Setup Script
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="eket-sdk",
    version="1.0.0",
    author="EKET Framework Team",
    author_email="noreply@eket.dev",
    description="Python SDK for EKET Agent Collaboration Protocol",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/eket-framework/python-sdk",
    project_urls={
        "Bug Tracker": "https://github.com/eket-framework/python-sdk/issues",
        "Documentation": "https://eket.dev/docs/sdk/python",
        "Source Code": "https://github.com/eket-framework/python-sdk",
    },
    packages=find_packages(exclude=["tests", "examples"]),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=requirements,
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "mypy>=1.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            # Future CLI tool entry point
            # "eket=eket_sdk.cli:main",
        ],
    },
    include_package_data=True,
    zip_safe=False,
)
