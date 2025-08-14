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

// 创建上传目录 - 在Vercel上使用临时目录
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION;
const uploadsDir = isVercel
  ? path.join('/tmp', 'uploads')  // Vercel环境使用/tmp目录
  : path.join(__dirname, 'uploads');  // 本地开发使用uploads目录

console.log('🌐 环境检测:', {
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NOW_REGION: process.env.NOW_REGION,
  isVercel: isVercel,
  uploadsDir: uploadsDir
});

// 确保上传目录存在
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
    version: '1.0.0',
    environment: isVercel ? 'vercel' : 'local',
    uploadsDir: uploadsDir,
    nodeEnv: process.env.NODE_ENV
  });
});

// 调试接口 - 检查文件系统状态
app.get('/api/debug/filesystem', (req, res) => {
  try {
    const debugInfo = {
      uploadsDir: uploadsDir,
      uploadsDirExists: fs.existsSync(uploadsDir),
      environment: isVercel ? 'vercel' : 'local',
      nodeEnv: process.env.NODE_ENV,
      cwd: process.cwd(),
      tmpDirExists: fs.existsSync('/tmp'),
      tmpDirWritable: false
    };

    // 测试临时目录写入权限
    try {
      const testFile = path.join('/tmp', 'test-write.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      debugInfo.tmpDirWritable = true;
    } catch (e) {
      debugInfo.tmpWriteError = e.message;
    }

    // 测试上传目录
    if (debugInfo.uploadsDirExists) {
      try {
        const files = fs.readdirSync(uploadsDir);
        debugInfo.filesInUploads = files.length;
        debugInfo.files = files.slice(0, 5); // 只显示前5个文件
      } catch (e) {
        debugInfo.readDirError = e.message;
      }
    }

    res.json({
      success: true,
      debug: debugInfo
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
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

    // 设置文件过期时间（在Vercel上，临时文件会在函数执行完毕后清理）
    const expiresAt = isVercel
      ? new Date(Date.now() + 60 * 60 * 1000).toISOString()  // Vercel上1小时过期
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();  // 本地24小时过期

    console.log(`📤 文件上传成功: ${req.file.originalname} -> ${publicUrl}`);
    console.log(`📁 存储位置: ${req.file.path}`);
    console.log(`🌐 环境: ${isVercel ? 'Vercel' : 'Local'}`);

    const result = {
      success: true,
      fileId: path.parse(req.file.filename).name,
      fileUrl: publicUrl,  // 前端期望的字段名
      fileName: req.file.originalname,  // 前端期望的字段名
      fileSize: req.file.size,  // 前端期望的字段名
      mimetype: req.file.mimetype,
      uploadTime: new Date().toISOString(),
      expiresAt: expiresAt,
      environment: isVercel ? 'vercel' : 'local'
    };

    res.json(result);

    // 只在非Vercel环境下设置定时删除（Vercel会自动清理临时文件）
    if (!isVercel) {
      setTimeout(() => {
        const filePath = req.file.path;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ 自动删除过期文件: ${req.file.filename}`);
        }
      }, 24 * 60 * 60 * 1000);
    }

  } catch (error) {
    console.error('❌ 文件上传失败:', error);
    console.error('📁 上传目录:', uploadsDir);
    console.error('🌐 环境变量 VERCEL:', process.env.VERCEL);

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        uploadsDir: uploadsDir,
        environment: isVercel ? 'vercel' : 'local'
      } : undefined
    });
  }
});

// 文件信息查询
app.get('/api/upload/info/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;

    // 检查上传目录是否存在
    if (!fs.existsSync(uploadsDir)) {
      return res.status(404).json({
        success: false,
        error: '上传目录不存在',
        environment: isVercel ? 'vercel' : 'local'
      });
    }

    const files = fs.readdirSync(uploadsDir);
    const targetFile = files.find(file => file.includes(fileId));

    if (!targetFile) {
      return res.status(404).json({
        success: false,
        error: '文件不存在',
        availableFiles: files.length,
        environment: isVercel ? 'vercel' : 'local'
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
      exists: true,
      environment: isVercel ? 'vercel' : 'local'
    });

  } catch (error) {
    console.error('❌ 文件信息查询失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      environment: isVercel ? 'vercel' : 'local'
    });
  }
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
