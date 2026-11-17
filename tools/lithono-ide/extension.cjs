const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const { routeTabPatterns } = require('./route-labels.cjs');

const MANIFEST = 'custom-elements.json';
const WORD = /[A-Za-z][\w.:-]*/;
const cache = new Map();

function workspaceRoot(document) {
  return (
    vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  );
}

function loadCatalog(root) {
  const file = path.join(root, MANIFEST);
  const stat = fs.statSync(file);
  const hit = cache.get(root);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.catalog;

  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byTag = new Map();
  for (const module of manifest.modules ?? []) {
    for (const declaration of module.declarations ?? []) {
      if (!declaration.tagName || !declaration.customElement) continue;
      const href = declaration.source?.href ?? module.path;
      const [rel, lineToken] = String(href).split('#L');
      byTag.set(declaration.tagName, {
        tag: declaration.tagName,
        className: declaration.name,
        file: path.join(root, rel),
        line: Math.max(0, Number(lineToken ?? 1) - 1),
        description: declaration.description ?? `\`<${declaration.tagName}>\``,
        attributes: declaration.attributes ?? [],
      });
    }
  }
  const catalog = { byTag };
  cache.set(root, { mtimeMs: stat.mtimeMs, catalog });
  return catalog;
}

function isTagUse(line, start) {
  return /<\/?$/.test(line.slice(0, start));
}

function enclosingTag(line, catalog) {
  const matches = [...line.matchAll(/<\/?([a-z][\w-]*)/g)];
  const last = matches.at(-1)?.[1];
  return last ? catalog.byTag.get(last) : undefined;
}

function resolveSymbol(document, position) {
  const root = workspaceRoot(document);
  if (!root) return null;
  let catalog;
  try {
    catalog = loadCatalog(root);
  } catch {
    return null;
  }

  const range = document.getWordRangeAtPosition(position, WORD);
  if (!range) return null;
  const word = document.getText(range);
  const line = document.lineAt(position.line).text;
  const tag = catalog.byTag.get(word);
  if (tag && isTagUse(line, range.start.character)) {
    return { range, element: tag, kind: 'tag' };
  }

  const parent = enclosingTag(line, catalog);
  if (!parent) return null;
  const attrName = word.replace(/^[.?@]/, '');
  const attribute = parent.attributes.find(
    (attr) => attr.name === attrName || attr.fieldName === attrName
  );
  if (!attribute) return null;
  return { range, element: parent, kind: 'attr', attribute };
}

function locationOf(element) {
  return new vscode.Location(vscode.Uri.file(element.file), new vscode.Position(element.line, 0));
}

async function configureRouteTabLabels() {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const active = vscode.window.activeTextEditor?.document;
  let folder = active ? vscode.workspace.getWorkspaceFolder(active.uri) : undefined;
  folder ??= folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
  if (!folder) return;

  const settings = vscode.workspace.getConfiguration('workbench.editor.customLabels', folder.uri);
  if (!settings.inspect('patterns')) {
    await vscode.window.showInformationMessage('This editor version does not support custom editor tab labels. Update the editor to use route-aware tabs.');
    return;
  }
  const routes = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, 'src/pages/**/{page,layout,error,not-found}.{ts,html,css}'));
  if (!routes.length) {
    await vscode.window.showInformationMessage('No Lithono route files were found under src/pages.');
    return;
  }
  const defaults = routeTabPatterns(path.join(folder.uri.fsPath, 'src/pages'), routes.map(uri => uri.fsPath));
  // Preserve existing user/workspace label rules. Apply only when this command is invoked.
  const patterns = { ...defaults, ...settings.get('patterns', {}) };
  await settings.update('patterns', patterns, vscode.ConfigurationTarget.WorkspaceFolder);
  await settings.update('enabled', true, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.window.showInformationMessage(`Route-aware editor tabs enabled for ${folder.name}.`);
}

function activate(context) {
  const selector = [
    { language: 'typescript', scheme: 'file' },
    { language: 'javascript', scheme: 'file' },
  ];

  context.subscriptions.push(
    vscode.commands.registerCommand('lithono.configureRouteTabLabels', configureRouteTabLabels),
    vscode.languages.registerDefinitionProvider(selector, {
      provideDefinition(document, position) {
        const hit = resolveSymbol(document, position);
        return hit ? locationOf(hit.element) : undefined;
      },
    }),
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        const hit = resolveSymbol(document, position);
        if (!hit) return undefined;
        const { element } = hit;
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**\`<${element.tag}>\`** — \`${element.className}\``);
        markdown.appendMarkdown(`\n\n${element.description}`);
        markdown.appendMarkdown(`\n\n[Open source](${vscode.Uri.file(element.file)})`);
        return new vscode.Hover(markdown, hit.range);
      },
    }),
    vscode.workspace.createFileSystemWatcher('**/custom-elements.json').onDidChange((uri) => {
      cache.delete(path.dirname(uri.fsPath));
    })
  );
}

function deactivate() {
  cache.clear();
}

module.exports = { activate, deactivate };
