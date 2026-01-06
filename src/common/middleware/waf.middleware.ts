import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class WafMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WafMiddleware.name);

  // Payload patterns adapted from the provided PHP Waf class
  private readonly payloads = {
    SQL: [
      "'", "´", "select from", "select * from", "onion", "union", "udpate users set", "where username",
      "drop table", "0x50", "mid((select", "union(((((((", "concat(0x", "concat(", "or boolean",
      "or having", "or '1", "0x3c62723e3c62723e3c62723e", "0x3c696d67207372633d22",
      "+#1q%0aunion all#qa%0a#%0aselect", "unhex(hex(concat(", "table_schema,0x3e,",
      "0x00", "0x08", "0x09", "0x0a", "0x0d", "0x1a", "0x22", "0x25", "0x27", "0x5c", "0x5f"
    ],
    XSS: [
      "<img", "img>", "<image", "document.cookie", "onerror()", "script>", "<script", "alert(",
      "window.", "string.fromcharcode(", "javascript:", "onmouseover=\"", "<body onload",
      "<style", "svg onload"
    ],
    LFI: [
      "../", "../../", "../../../", "../../../../", "../../../../../", "../../../../../../"
    ],
    RFI: [
      "http://", "https://"
    ],
    RCE: [
      "&cmd=", "system(", "whoami", "mkdir", "wget%20", "exec(", "<!--#exec",
      "<?php", "cat%20", "/etc/passwd", "ping%20", "echo%20", "|%20ls%20-l%20/", "cd%20"
    ],
    TOT: [ // "BOT" in the original, but let's keep it specific or merge. The PHP had a 'BOT' category.
        "sqlmap", "nikto", "nmap", "arachni", "python-requests", "wget", "curl", "commix", 
        "havij", "w3af", "zeus", "shodan"
    ]
  };

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(`Scanning request: ${req.method} ${req.url}`);
    // 1. Check User-Agent for bots
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    if (this.isBot(userAgent)) {
      this.logger.warn(`Blocked Bot: ${userAgent} - IP: ${req.ip}`);
      throw new HttpException('Access Denied (Bot detected)', HttpStatus.FORBIDDEN);
    }

    // 2. Flatten all inputs (Body, Query, Params)
    const allInputs = this.flattenObject({
      body: req.body,
      query: req.query,
      params: req.params,
      // You can add headers checks here if needed, but risky for false positives on authorized headers
    });

    // 3. Scan inputs for attacks
    for (const input of allInputs) {
      if (!input) continue;
      const lowerInput = String(input).toLowerCase();
      
      if (this.checkAttack(lowerInput, 'SQL')) {
          this.logger.warn(`SQL Injection Attempt detected: ${lowerInput} - IP: ${req.ip}`);
          throw new HttpException('Access Denied (SQL Checks)', HttpStatus.BAD_REQUEST);
      }
      if (this.checkAttack(lowerInput, 'XSS')) {
          this.logger.warn(`XSS Attempt detected: ${lowerInput} - IP: ${req.ip}`);
          throw new HttpException('Access Denied (XSS Checks)', HttpStatus.BAD_REQUEST);
      }
      if (this.checkAttack(lowerInput, 'LFI')) {
          this.logger.warn(`LFI Attempt detected: ${lowerInput} - IP: ${req.ip}`);
          throw new HttpException('Access Denied (LFI Checks)', HttpStatus.BAD_REQUEST);
      }
      if (this.checkAttack(lowerInput, 'RFI')) {
        // RFI is tricky for valid URLs in body, proceed with caution or specific context
         this.logger.warn(`RFI Attempt detected: ${lowerInput} - IP: ${req.ip}`);
         throw new HttpException('Access Denied (RFI Checks)', HttpStatus.BAD_REQUEST);
      }
      if (this.checkAttack(lowerInput, 'RCE')) {
          this.logger.warn(`RCE Attempt detected: ${lowerInput} - IP: ${req.ip}`);
          throw new HttpException('Access Denied (RCE Checks)', HttpStatus.BAD_REQUEST);
      }
    }

    next();
  }

  private isBot(userAgent: string): boolean {
    if (!userAgent) return false;
    return this.payloads.TOT.some(bot => userAgent.includes(bot.toLowerCase()));
  }

  private checkAttack(input: string, type: 'SQL' | 'XSS' | 'LFI' | 'RFI' | 'RCE'): boolean {
    return this.payloads[type].some(payload => input.includes(payload));
  }

  // Helper to flatten nested objects into a single array of strings
  private flattenObject(obj: any): string[] {
    let result: string[] = [];
    
    if (!obj || (typeof obj !== 'object' && !Array.isArray(obj))) {
        return [String(obj)];
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          result = result.concat(this.flattenObject(value));
        } else {
          result.push(String(value));
        }
      }
    }
    return result;
  }
}
