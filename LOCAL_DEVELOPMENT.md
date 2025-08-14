# 本地开发环境配置指南

## 预发环境API访问配置

### Windows系统
1. 以管理员身份打开记事本
2. 打开文件：`C:\Windows\System32\drivers\etc\hosts`
3. 在文件末尾添加以下行：
```
120.27.196.223 cs.sase.pre.eagleyun.com
```
4. 保存文件

### macOS/Linux系统
1. 打开终端
2. 执行命令：
```bash
sudo echo "120.27.196.223 cs.sase.pre.eagleyun.com" >> /etc/hosts
```

### 验证配置
在终端/命令行中执行：
```bash
ping cs.sase.pre.eagleyun.com
```
应该看到响应来自 `120.27.196.223`

## 环境变量配置

### 本地开发
创建 `.env` 文件：
```
WATERMARK_API_BASE_URL=https://cs.sase.pre.eagleyun.com
WATERMARK_ACCESS_KEY=CnCZar6ZXKvqdBKMJ54vwNzO
WATERMARK_SECRET_KEY=ajKx1uSye4wwa9T7srJQYlDOLK34NR0F1yDUDGgL
```

### Vercel部署
自动使用IP地址访问：
- 生产环境URL: `https://120.27.196.223`
- 自动添加Host头解决SSL证书问题

## 启动本地开发服务器
```bash
npm install
npm run dev
```

## 测试API
```bash
# 健康检查
curl http://localhost:3001/api/watermark/health

# 创建水印任务
curl -X POST http://localhost:3001/api/watermark/create \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "https://example.com/test.pdf",
    "content": "测试水印",
    "bizId": "test123"
  }'
```
