const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'HTML 表单数据填充工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  const menuTemplate = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开 HTML 文件',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:open-html')
        },
        {
          label: '导入数据文件',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow.webContents.send('menu:import-data')
        },
        { type: 'separator' },
        {
          label: '导出填充结果',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:export-result')
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => mainWindow.webContents.send('menu:about')
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:openHtml', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 HTML 文件',
    filters: [
      { name: 'HTML 文件', extensions: ['html', 'htm'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  return { path: filePath, content };
});

ipcMain.handle('dialog:openData', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择数据文件',
    filters: [
      { name: '数据文件', extensions: ['csv', 'json'] },
      { name: 'CSV', extensions: ['csv'] },
      { name: 'JSON', extensions: ['json'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return { path: filePath, content, type: ext };
});

ipcMain.handle('dialog:saveHtml', async (_event, { defaultName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存填充结果',
    defaultPath: defaultName || 'filled.html',
    filters: [
      { name: 'HTML 文件', extensions: ['html'] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, 'utf-8');
  return result.filePath;
});

ipcMain.handle('dialog:saveBatch', async (_event, { files }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择保存批量结果的文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const dir = result.filePaths[0];
  const savedPaths = [];
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    await fs.writeFile(fullPath, file.content, 'utf-8');
    savedPaths.push(fullPath);
  }
  return { directory: dir, files: savedPaths };
});
