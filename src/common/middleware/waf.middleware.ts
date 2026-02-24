import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class WafMiddleware implements NestMiddleware {
  private readonly logger = new Logger(WafMiddleware.name);


  private readonly payloads = {
    SQL: [
      "´", "select from", "select * from", "onion", "union", "udpate users set", "where username",
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
    TOT: [ 
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

    const ignoreFields = ['content']; // Fields to exclude from WAF scanning

    // 3. Scan inputs for attacks
    for (const input of allInputs) {
      if (!input.value) continue;
      const lowerInput = String(input.value).toLowerCase();
      
      // Skip ignored fields
      if (ignoreFields.includes(input.key)) continue;

      const sqlAttack = this.checkAttack(lowerInput, 'SQL');
      if (sqlAttack) {
          this.logger.warn(`SQL Injection Attempt detected. Trigger: "${sqlAttack}" - Input: ${lowerInput.substring(0, 50)}... - IP: ${req.ip}`);
          throw new HttpException('Access Denied (SQL Checks)', HttpStatus.FORBIDDEN);
      }
      const xssAttack = this.checkAttack(lowerInput, 'XSS');
      if (xssAttack) {
          this.logger.warn(`XSS Attempt detected. Trigger: "${xssAttack}" - Input: ${lowerInput.substring(0, 50)}... - IP: ${req.ip}`);
          throw new HttpException('Access Denied (XSS Checks)', HttpStatus.FORBIDDEN);
      }
      const lfiAttack = this.checkAttack(lowerInput, 'LFI');
      if (lfiAttack) {
          this.logger.warn(`LFI Attempt detected. Trigger: "${lfiAttack}" - Input: ${lowerInput.substring(0, 50)}... - IP: ${req.ip}`);
          throw new HttpException('Access Denied (LFI Checks)', HttpStatus.FORBIDDEN);
      }
      const rfiAttack = this.checkAttack(lowerInput, 'RFI');
      if (rfiAttack) {
         this.logger.warn(`RFI Attempt detected. Trigger: "${rfiAttack}" - Input: ${lowerInput.substring(0, 50)}... - IP: ${req.ip}`);
         throw new HttpException('Access Denied (RFI Checks)', HttpStatus.FORBIDDEN);
      }
      const rceAttack = this.checkAttack(lowerInput, 'RCE');
      if (rceAttack) {
          this.logger.warn(`RCE Attempt detected. Trigger: "${rceAttack}" - Input: ${lowerInput.substring(0, 50)}... - IP: ${req.ip}`);
          throw new HttpException('Access Denied (RCE Checks)', HttpStatus.FORBIDDEN);
      }
    }

    next();
  }

  private isBot(userAgent: string): boolean {
    if (!userAgent) return false;
    return this.payloads.TOT.some(bot => userAgent.includes(bot.toLowerCase()));
  }

  private checkAttack(input: string, type: 'SQL' | 'XSS' | 'LFI' | 'RFI' | 'RCE'): string | null {
    const found = this.payloads[type].find(payload => input.includes(payload));
    return found || null;
  }

  // Helper to flatten nested objects into a single array of objects with key and value
  private flattenObject(obj: any, parentKey = ''): { key: string, value: string }[] {
    let result: { key: string, value: string }[] = [];
    
    if (!obj || (typeof obj !== 'object' && !Array.isArray(obj))) {
        return [{ key: parentKey, value: String(obj) }];
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;
        
        if (typeof value === 'object' && value !== null) {
          result = result.concat(this.flattenObject(value, newKey));
        } else {
          result.push({ key: newKey, value: String(value) });
        }
      }
    }
    return result;
  }
}
