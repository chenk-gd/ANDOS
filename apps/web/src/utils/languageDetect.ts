interface LanguageMapping {
  extensions: string[]
  language: string
  label: string
}

const languageMappings: LanguageMapping[] = [
  { extensions: ['.md', '.markdown'], language: 'markdown', label: 'Markdown' },
  { extensions: ['.json'], language: 'json', label: 'JSON' },
  { extensions: ['.yaml', '.yml'], language: 'yaml', label: 'YAML' },
  { extensions: ['.xml'], language: 'xml', label: 'XML' },
  { extensions: ['.html', '.htm'], language: 'html', label: 'HTML' },
  { extensions: ['.js', '.mjs', '.cjs'], language: 'javascript', label: 'JavaScript' },
  { extensions: ['.ts', '.mts', '.cts', '.tsx'], language: 'typescript', label: 'TypeScript' },
  { extensions: ['.py'], language: 'python', label: 'Python' },
  { extensions: ['.java'], language: 'java', label: 'Java' },
  { extensions: ['.go'], language: 'go', label: 'Go' },
  { extensions: ['.rs'], language: 'rust', label: 'Rust' },
  { extensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'], language: 'cpp', label: 'C/C++' },
  { extensions: ['.cs'], language: 'csharp', label: 'C#' },
  { extensions: ['.sql'], language: 'sql', label: 'SQL' },
  { extensions: ['.dockerfile', 'dockerfile'], language: 'dockerfile', label: 'Dockerfile' },
  { extensions: ['.sh', '.bash', '.zsh'], language: 'shell', label: 'Shell' },
  { extensions: ['.vue'], language: 'html', label: 'Vue' },
  { extensions: ['.css'], language: 'css', label: 'CSS' },
  { extensions: ['.scss', '.sass'], language: 'scss', label: 'SCSS' },
  { extensions: ['.less'], language: 'less', label: 'Less' },
]

export function detectLanguage(filename: string): string {
  if (!filename) return 'plaintext'

  const lowerFilename = filename.toLowerCase()

  for (const mapping of languageMappings) {
    for (const ext of mapping.extensions) {
      if (lowerFilename.endsWith(ext)) {
        return mapping.language
      }
    }
  }

  return 'plaintext'
}

export function getLanguageLabel(language: string): string {
  const mapping = languageMappings.find(m => m.language === language)
  return mapping?.label || 'Plain Text'
}

export function getLanguageByExtension(extension: string): string {
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`

  for (const mapping of languageMappings) {
    if (mapping.extensions.includes(ext)) {
      return mapping.language
    }
  }

  return 'plaintext'
}
