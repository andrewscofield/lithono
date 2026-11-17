const path = require('node:path');

/** Match by depth so bracketed parameters need no glob escaping and renames stay current. */
function routeTabPatterns(pagesDirectory, files) {
  const maxDepth = Math.max(0, ...files.map(file => {
    const directory = path.relative(pagesDirectory, path.dirname(file));
    return directory ? directory.split(path.sep).length : 0;
  }));
  const patterns = {};
  for (let depth = 0; depth <= maxDepth; depth++) {
    const pattern = `**/src/pages/${'*/'.repeat(depth)}{page,layout,error,not-found}.{ts,html,css}`;
    const directories = Array.from({ length: depth }, (_, index) => {
      const ancestor = depth - index - 1;
      return ancestor ? `\${dirname(${ancestor})}` : '${dirname}';
    });
    patterns[pattern] = depth
      ? `${directories.join('/')}/\${filename}.\${extname}`
      : '/ · ${filename}.${extname}';
  }
  return patterns;
}

module.exports = { routeTabPatterns };
