import { WafMiddleware } from './waf.middleware';
import { Request, Response, NextFunction } from 'express';
import { HttpException } from '@nestjs/common';

describe('WafMiddleware', () => {
  let middleware: WafMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    middleware = new WafMiddleware();
    mockRequest = {
      headers: {},
      body: {},
      query: {},
      params: {},
      ip: '127.0.0.1',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('should allow benign requests', () => {
    mockRequest.body = { name: 'John Doe', age: 30 };
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });

  describe('Bot Detection', () => {
    it('should block known bot user-agents', () => {
      mockRequest.headers = { 'user-agent': 'sqlmap/1.0' };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow normal user-agents', () => {
      mockRequest.headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('SQL Injection', () => {
    it('should block SQL injection in body', () => {
      mockRequest.body = { username: "' OR '1'='1" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });

    it('should block SQL injection in query params', () => {
      mockRequest.query = { id: "union select * from users" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });
  });

  describe('XSS Attacks', () => {
    it('should block script tags', () => {
      mockRequest.body = { comment: "<script>alert('xss')</script>" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });

    it('should block javascript: uri', () => {
      mockRequest.query = { redirect: "javascript:alert(1)" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });
  });

  describe('LFI/RFI Attacks', () => {
    it('should block directory traversal (LFI)', () => {
      mockRequest.params = { file: "../../../etc/passwd" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });

    it('should block remote file inclusion (RFI)', () => {
      mockRequest.query = { url: "http://attacker.com/shell.php" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });
  });

  describe('RCE Attacks', () => {
    it('should block system commands', () => {
      mockRequest.body = { cmd: "cat /etc/passwd" };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });
  });
  
  describe('Nested Objects', () => {
     it('should detect attacks in deeply nested objects', () => {
      mockRequest.body = { 
          user: { 
              profile: {
                  bio: "Hello <script>bad()</script>"
              }
          }
      };
      
      expect(() => {
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(HttpException);
    });
  });
});
