// logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console(), // 控制台输出
    new winston.transports.File({ filename: 'dex.log' }) // 文件输出
  ],
});

export default logger;