/**
 * POST /api/admin/packages/generate - Generate deployment package
 */

import { serverDb } from '@/lib/db/server-database';
import type { Customer, License } from '@/lib/db/schema';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, packageType, modules, includeLicensingModule, includeVersionRelease } = body;

    if (!customerId || !packageType) {
      return Response.json(
        { error: 'Customer ID and package type are required' },
        { status: 400 }
      );
    }

    // Verify customer exists
    const customer = serverDb.getById<Customer>('customers', customerId);
    if (!customer) {
      return Response.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    // Get customer's license
    const licenses = serverDb.getAll<License>('licenses');
    const license = licenses.find((l) => l.customerId === customerId && l.status === 'active');
    if (!license) {
      return Response.json(
        { error: 'No active license found for customer' },
        { status: 404 }
      );
    }

    // Get plan if available
    const plans = serverDb.getAll<any>('purchase_plans');
    const plan = plans.find((p: any) => p.id === (license as any).planId);

    // Generate package metadata
    const packageId = `pkg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const effectiveModules = modules || license.modules;
    const packageData = {
      id: packageId,
      customerId,
      licenseKey: license.licenseKey,
      packageType,
      modules: effectiveModules,
      includeLicensingModule: !!includeLicensingModule,
      includeVersionRelease: !!includeVersionRelease,
      createdAt: new Date(),
      expiresAt: license.expiresAt,
    };

    // Store package metadata
    serverDb.create('packages', packageData);

    // Write license-seed.json so it can be bundled into the EXE as an extraResource.
    // The Electron main process reads this on first startup to seed the customer's serverDb.
    const seedData = {
      customer: {
        id: customer.id,
        name: (customer as any).name,
        email: (customer as any).email,
        phone: (customer as any).phone,
      },
      license: {
        id: license.id,
        customerId: license.customerId,
        licenseKey: license.licenseKey,
        status: license.status,
        modules: effectiveModules,
        maxConcurrentComputers: (license as any).maxConcurrentComputers || 5,
        maxPrescriptions: (license as any).maxPrescriptions,
        expiresAt: license.expiresAt,
        planId: (license as any).planId,
      },
      ...(plan ? { plan: { id: plan.id, name: plan.name, features: plan.features } } : {}),
    };

    // Write to project root so electron-builder can pick it up as extraResource
    const seedPath = path.join(process.cwd(), 'license-seed.json');
    fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), 'utf-8');
    console.log(`[PackageGen] license-seed.json written to: ${seedPath}`);

    // Generate instructions based on package type
    let instructions = '';
    switch (packageType) {
      case 'pm2':
        instructions = `
# PM2 Bundle Installation

1. Extract the bundle: tar -xzf clinic-app-pm2.tar.gz
2. Navigate to directory: cd clinic-app
3. Install dependencies: npm install
4. Start with PM2: pm2 start ecosystem.config.js
5. Save PM2 config: pm2 save
6. Setup auto-start: pm2 startup

License Key: ${license.licenseKey}
Expires: ${license.expiresAt?.toISOString()}
        `;
        break;
      case 'exe':
        instructions = `
# Windows EXE Installation

1. Run the installer: HomeoPMS-Setup.exe
2. Follow the installation wizard
3. On first launch, enter your license key: ${license.licenseKey}
4. The application will activate automatically

License Key: ${license.licenseKey}
Expires: ${license.expiresAt?.toISOString()}
Modules: ${effectiveModules.join(', ')}

Note: Build the EXE AFTER generating this package (license-seed.json is now ready).
Run: npm run electron:dist
        `;
        break;
      case 'portable':
        instructions = `
# Portable Executable

1. Download: HomeoPMS-Portable.exe
2. Run directly — no installation needed
3. On first launch, enter your license key: ${license.licenseKey}

License Key: ${license.licenseKey}
Expires: ${license.expiresAt?.toISOString()}
        `;
        break;
    }

    // Log audit
    serverDb.create('license_audit_log', {
      licenseId: license.id,
      customerId,
      action: `Package generated: ${packageType}`,
      performedBy: 'admin',
    });

    return Response.json(
      {
        packageId,
        packageType,
        licenseKey: license.licenseKey,
        downloadUrl: `/api/admin/packages/${packageId}/download`,
        instructions,
        seedFileWritten: true,
        nextStep: packageType === 'exe' ? 'Run npm run electron:dist to build the EXE with the license pre-seeded.' : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Generate package error:', error);
    return Response.json(
      { error: 'Failed to generate package' },
      { status: 500 }
    );
  }
}
