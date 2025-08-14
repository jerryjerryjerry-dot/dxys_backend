// 水印系统文件上传后端服务
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 启用CORS - 允许任何来源访问
app.use(cors({
  origin: true,  // 允许任何来源
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 解析JSON请求体
app.use(express.json());

// 创建上传目录
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const filename = `${timestamp}_${uniqueId}${ext}`;
    cb(null, filename);
  }
});

// 文件类型验证
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/json',
    'text/xml',
    'application/xml',
    'image/jpeg',
    'image/png',
    'image/gif',
    'audio/mpeg',
    'audio/wav',
    'video/mp4'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// 静态文件服务 - 提供公网访问
app.use('/files', express.static(uploadsDir));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    timestamp: new Date().toISOString(),
    service: 'watermark-upload-backend',
    version: '1.0.0'
  });
});

// 文件上传接口
app.post('/api/upload/public', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '没有上传文件'
      });
    }

    // 生成公网可访问的URL
    const baseUrl = req.protocol + '://' + req.get('host');
    const publicUrl = `${baseUrl}/files/${req.file.filename}`;

    // 设置文件过期时间（24小时）
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    console.log(`📤 文件上传成功: ${req.file.originalname} -> ${publicUrl}`);

    const result = {
      success: true,
      fileId: path.parse(req.file.filename).name,
      fileUrl: publicUrl,  // 前端期望的字段名
      fileName: req.file.originalname,  // 前端期望的字段名
      fileSize: req.file.size,  // 前端期望的字段名
      mimetype: req.file.mimetype,
      uploadTime: new Date().toISOString(),
      expiresAt: expiresAt
    };

    res.json(result);

    // 24小时后自动删除文件
    setTimeout(() => {
      const filePath = req.file.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ 自动删除过期文件: ${req.file.filename}`);
      }
    }, 24 * 60 * 60 * 1000);

  } catch (error) {
    console.error('❌ 文件上传失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 文件信息查询
app.get('/api/upload/info/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const files = fs.readdirSync(uploadsDir);
  const targetFile = files.find(file => file.includes(fileId));

  if (!targetFile) {
    return res.status(404).json({
      success: false,
      error: '文件不存在'
    });
  }

  const filePath = path.join(uploadsDir, targetFile);
  const stats = fs.statSync(filePath);
  const baseUrl = req.protocol + '://' + req.get('host');

  res.json({
    success: true,
    fileId: fileId,
    filename: targetFile,
    publicUrl: `${baseUrl}/files/${targetFile}`,
    size: stats.size,
    uploadTime: stats.birthtime.toISOString(),
    exists: true
  });
});

// 文件删除
app.delete('/api/upload/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    const files = fs.readdirSync(uploadsDir);
    const targetFile = files.find(file => file.includes(fileId));

    if (!targetFile) {
      return res.status(404).json({
        success: false,
        error: '文件不存在'
      });
    }

    const filePath = path.join(uploadsDir, targetFile);
    fs.unlinkSync(filePath);

    console.log(`🗑️ 手动删除文件: ${targetFile}`);

    res.json({
      success: true,
      message: '文件删除成功'
    });

  } catch (error) {
    console.error('❌ 文件删除失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('❌ 服务器错误:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: '文件大小超过限制 (50MB)'
      });
    }
  }

  res.status(500).json({
    success: false,
    error: error.message || '服务器内部错误'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 文件上传后端服务已启动:`);
  console.log(`   - 端口: ${PORT}`);
  console.log(`   - 上传接口: http://localhost:${PORT}/api/upload/public`);
  console.log(`   - 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`   - 文件访问: http://localhost:${PORT}/files/`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 服务器正在关闭...');
  process.exit(0);
});

module.exports = app;
