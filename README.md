# 水印系统后端服务

## 功能
- 文件上传到公网可访问的URL
- 支持多种文件格式
- 自动文件过期清理
- CORS跨域支持

## 本地开发
```bash
npm install
npm start
```

## 部署到Vercel
```bash
npm install -g vercel
vercel login
vercel --prod
```

## API接口

### 上传文件
```
POST /api/upload/public
Content-Type: multipart/form-data

Body: file (文件)
```

### 健康检查
```
GET /api/health
```

### 文件访问
```
GET /files/{filename}
```

## 环境变量
- `PORT`: 服务端口 (默认3001)
- `NODE_ENV`: 环境 (development/production)
