import * as esbuild from 'esbuild';
import { builtinModules } from 'module';

const buildServer = async () => {
  console.log('🚀 Building server for production...');
  
  try {
    await esbuild.build({
      entryPoints: ['server/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: 'dist-server/index.cjs',
      format: 'cjs',
      external: [
        ...builtinModules,
        'pg-native', // Postgres driver often has native parts
        'bcryptjs',  // Sometimes problematic to bundle
        'fsevents',
        'pino-pretty'
      ],
      sourcemap: true,
      minify: false, // Keep it readable for debugging in prod if needed
      define: {
        'process.env.NODE_ENV': '"production"'
      },
      logLevel: 'info',
    });
    console.log('✅ Server build complete: dist-server/index.cjs');
  } catch (error) {
    console.error('❌ Server build failed:', error);
    process.exit(1);
  }
};

buildServer();
