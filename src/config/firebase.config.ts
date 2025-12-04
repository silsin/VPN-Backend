import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FirebaseConfig {
  private firebaseApp: admin.app.App;

  constructor(private configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    // Check if already initialized
    if (admin.apps.length > 0) {
      this.firebaseApp = admin.apps[0];
      return;
    }

    const serviceAccountPath = this.configService.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
    );

    if (serviceAccountPath) {
      // Initialize with service account file
      const serviceAccount = require(`../../${serviceAccountPath}`);
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      // Initialize with environment variables
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const privateKey = this.configService
        .get<string>('FIREBASE_PRIVATE_KEY')
        ?.replace(/\\n/g, '\n');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );

      if (!projectId || !privateKey || !clientEmail) {
        console.warn(
          'Firebase credentials not configured. Push notifications will not work.',
        );
        return;
      }

      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey,
          clientEmail,
        }),
      });
    }

    console.log('Firebase Admin SDK initialized successfully');
  }

  getMessaging(): admin.messaging.Messaging {
    if (!this.firebaseApp) {
      throw new Error('Firebase is not initialized');
    }
    return admin.messaging(this.firebaseApp);
  }

  isInitialized(): boolean {
    return !!this.firebaseApp;
  }
}
