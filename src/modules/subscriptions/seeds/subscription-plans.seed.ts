import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';

@Injectable()
export class SubscriptionPlansSeeder {
  constructor(
    @InjectRepository(SubscriptionPlan)
    private plansRepository: Repository<SubscriptionPlan>,
  ) {}

  async seed(): Promise<void> {
    const existingPlans = await this.plansRepository.count();

    if (existingPlans > 0) {
      console.log('Subscription plans already seeded. Skipping...');
      return;
    }

    const plans: SubscriptionPlan[] = [
      {
        id: undefined, // Will be generated
        name: 'Free',
        description: 'Basic VPN access with ads',
        durationDays: null, // No expiration
        price: 0,
        dataLimitGb: 500,
        maxDevices: 1,
        features: ['basic_vpn'],
        displayOrder: 1,
        isActive: true,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userSubscriptions: [],
        payments: [],
      } as any,
      {
        id: undefined,
        name: 'Monthly',
        description: 'Premium VPN with unlimited data and no ads',
        durationDays: 30,
        price: 4.99,
        dataLimitGb: null, // Unlimited
        maxDevices: 3,
        features: ['premium_vpn', 'ad_free', 'priority_support', 'multi_device'],
        displayOrder: 2,
        isActive: true,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userSubscriptions: [],
        payments: [],
      } as any,
      {
        id: undefined,
        name: 'Quarterly',
        description: 'Best value - 3 months of premium VPN',
        durationDays: 90,
        price: 12.99,
        dataLimitGb: null, // Unlimited
        maxDevices: 5,
        features: ['premium_vpn', 'ad_free', 'priority_support', 'multi_device'],
        displayOrder: 3,
        isActive: true,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userSubscriptions: [],
        payments: [],
      } as any,
      {
        id: undefined,
        name: 'Annual',
        description: 'Maximum savings - Full year of premium access with all features',
        durationDays: 365,
        price: 39.99,
        dataLimitGb: null, // Unlimited
        maxDevices: 10,
        features: [
          'premium_vpn',
          'ad_free',
          'priority_support',
          'multi_device',
          'static_ip',
        ],
        displayOrder: 4,
        isActive: true,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userSubscriptions: [],
        payments: [],
      } as any,
    ];

    await this.plansRepository.save(plans);
    console.log(`✅ Seeded ${plans.length} subscription plans`);
  }
}
