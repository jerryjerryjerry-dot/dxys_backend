// 后端水印API集成 - 解决CORS问题
const crypto = require('crypto');
const fetch = require('node-fetch');

class WatermarkAPIBackend {
  constructor() {
    this.config = {
      baseURL: 'https://cs.sase.pre.eagleyun.com',
      accessKey: 'CnCZar6ZXKvqdBKMJ54vwNzO',
      secretKey: 'ajKx1uSye4wwa9T7srJQYlDOLK34NR0F1yDUDGgL',
      endpoints: {
        addWatermarkTask: '/dlp/file_process/add_watermark_task',
        queryTask: '/dlp/file_process/task',
        extractWatermarkTask: '/dlp/file_process/extract_watermark_task'
      },
      timeout: 30000,
      maxRetries: 3
    };
  }

  /**
   * 生成HMAC-SHA256签名
   * @param {string} method HTTP方法
   * @param {string} endpoint API端点
   * @param {string} date 日期字符串
   * @param {string} body 请求体
   * @returns {string} 签名
   */
  generateSignature(method, endpoint, date, body = '') {
    try {
      const stringToSign = `${method}\n${endpoint}\n${date}\n${body}`;
      const signature = crypto
        .createHmac('sha256', this.config.secretKey)
        .update(stringToSign)
        .digest('base64');

      console.log('🔐 生成签名:');
      console.log('  - 待签名字符串:', stringToSign.replace(/\n/g, '\\n'));
      console.log('  - 签名结果:', signature);

      return signature;
    } catch (error) {
      console.error('❌ 签名生成失败:', error);
      throw new Error(`签名生成失败: ${error.message}`);
    }
  }

  /**
   * 发送认证请求
   * @param {string} method HTTP方法
   * @param {string} endpoint API端点
   * @param {Object} data 请求数据
   * @returns {Promise<Object>} 响应数据
   */
  async makeAuthenticatedRequest(method, endpoint, data = null) {
    const url = `${this.config.baseURL}${endpoint}`;
    const date = new Date().toUTCString();
    const body = data ? JSON.stringify(data) : '';
    const signature = this.generateSignature(method, endpoint, date, body);

    const headers = {
      'Content-Type': 'application/json',
      'Date': date,
      'X-HMAC-ALGORITHM': 'hmac-sha256',
      'X-HMAC-ACCESS-KEY': this.config.accessKey,
      'X-HMAC-SIGNATURE': signature
    };

    console.log('🌐 发送API请求:');
    console.log('  - URL:', url);
    console.log('  - Method:', method);
    console.log('  - Headers:', headers);
    console.log('  - Body:', body);

    const requestOptions = {
      method,
      headers,
      timeout: this.config.timeout
    };

    if (data) {
      requestOptions.body = body;
    }

    try {
      const response = await fetch(url, requestOptions);

      console.log('📨 API响应:');
      console.log('  - Status:', response.status);
      console.log('  - StatusText:', response.statusText);

      const responseText = await response.text();
      console.log('  - Response Body:', responseText);

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.warn('⚠️ 响应不是有效JSON:', parseError.message);
        responseData = { rawResponse: responseText };
      }

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${responseText}`);
      }

      return responseData;
    } catch (error) {
      console.error('❌ API请求失败:', error);
      throw new Error(`API请求失败: ${error.message}`);
    }
  }

  /**
   * 创建添加水印任务
   * @param {string} fileUrl 文件URL
   * @param {string} content 水印内容
   * @param {string} bizId 业务ID
   * @returns {Promise<Object>} 任务信息
   */
  async createWatermarkTask(fileUrl, content, bizId) {
    console.log('🎨 创建水印任务:');
    console.log('  - 文件URL:', fileUrl);
    console.log('  - 水印内容:', content);
    console.log('  - 业务ID:', bizId);

    const requestData = {
      file_url: fileUrl,
      content: content,
      biz_id: bizId,
      type: 1, // 1-可见水印, 2-不可见水印
      timing: {
        "enabled": false
      }
    };

    try {
      const result = await this.makeAuthenticatedRequest(
        'POST',
        this.config.endpoints.addWatermarkTask,
        requestData
      );

      console.log('✅ 水印任务创建成功:', result);
      return result;
    } catch (error) {
      console.error('❌ 创建水印任务失败:', error);
      throw error;
    }
  }

  /**
   * 查询任务状态
   * @param {string} taskId 任务ID
   * @returns {Promise<Object>} 任务状态
   */
  async queryTaskStatus(taskId) {
    console.log('🔍 查询任务状态:', taskId);

    try {
      const result = await this.makeAuthenticatedRequest(
        'GET',
        `${this.config.endpoints.queryTask}/${taskId}`
      );

      console.log('📊 任务状态查询结果:', result);
      return result;
    } catch (error) {
      console.error('❌ 查询任务状态失败:', error);
      throw error;
    }
  }

  /**
   * 创建提取水印任务
   * @param {string} fileUrl 文件URL
   * @param {string} bizId 业务ID
   * @returns {Promise<Object>} 任务信息
   */
  async createExtractWatermarkTask(fileUrl, bizId) {
    console.log('🔍 创建水印提取任务:');
    console.log('  - 文件URL:', fileUrl);
    console.log('  - 业务ID:', bizId);

    const requestData = {
      file_url: fileUrl,
      biz_id: bizId
    };

    try {
      const result = await this.makeAuthenticatedRequest(
        'POST',
        this.config.endpoints.extractWatermarkTask,
        requestData
      );

      console.log('✅ 水印提取任务创建成功:', result);
      return result;
    } catch (error) {
      console.error('❌ 创建水印提取任务失败:', error);
      throw error;
    }
  }

  /**
   * 带重试的请求包装器
   * @param {Function} requestFn 请求函数
   * @param {number} maxRetries 最大重试次数
   * @returns {Promise<Object>} 请求结果
   */
  async retryRequest(requestFn, maxRetries = this.config.maxRetries) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 尝试第 ${attempt} 次请求...`);
        const result = await requestFn();
        console.log(`✅ 第 ${attempt} 次请求成功`);
        return result;
      } catch (error) {
        lastError = error;
        console.log(`❌ 第 ${attempt} 次请求失败:`, error.message);

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 指数退避
          console.log(`⏳ 等待 ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`请求失败，已重试 ${maxRetries} 次: ${lastError.message}`);
  }

  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  async healthCheck() {
    try {
      // 简单的连通性测试
      const response = await fetch(this.config.baseURL, {
        method: 'GET',
        timeout: 5000
      });

      return {
        status: 'healthy',
        baseURL: this.config.baseURL,
        accessible: response.status < 500
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        baseURL: this.config.baseURL,
        error: error.message
      };
    }
  }
}

// 导出单例实例
module.exports = new WatermarkAPIBackend();

