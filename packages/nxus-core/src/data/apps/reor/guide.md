# Reor User Guide

Reor is an open-source, AI-powered note-taking app that runs LLMs locally. It allows you to build a local knowledge base that you can chat with, ensuring your data never leaves your machine.

## Getting Started

1.  **Clone the Repository**: Click the "Clone" button in Nxus to download the source code.
2.  **Install Dependencies**: Run the "Install Dependencies" command (`npm install`).
3.  **Build and Run**: Run the "Build App" command (`npm run build`) to compile the application.

## Key Features

- **Local-first**: All models run on your machine (via Ollama or internal engines).
- **Markdown-based**: Uses standard Markdown for notes.
- **RAG (Retrieval-Augmented Generation)**: Chat with your own notes using local embeddings.

## Local LLM Setup

Reor works best when paired with **Ollama**.

- Download Ollama from [ollama.com](https://ollama.com).
- Pull your favorite model: `ollama pull llama3`.
- Configure Reor to use the local Ollama endpoint.

{{command:npm-install}}
{{command:npm-build}}
