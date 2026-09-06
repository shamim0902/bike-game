/** Shared GitHub display helpers (used by the repo grid and the project drive). */
export const langColor = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Vue: '#41b883', PHP: '#4f5d95', Go: '#00add8', Ruby: '#701516',
  Python: '#3572a5', HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Shell: '#89e051', Dart: '#00b4ab', Swift: '#f05138'
}
export const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n))
