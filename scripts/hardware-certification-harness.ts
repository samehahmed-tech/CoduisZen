import assert from 'node:assert/strict';
import {
    getHardwareCertificationMatrix,
    getPrinterCertificationResult,
    isValidEan13,
    parseScaleReading,
} from '../src/services/hardwareCertification';

assert.equal(getPrinterCertificationResult('WINDOWS').directOffline, true);
assert.equal(getPrinterCertificationResult('LAN').directOffline, false);
assert.equal(isValidEan13('4006381333931'), true);
assert.deepEqual(parseScaleReading('ST 1.250 kg'), { grams: 1250, stable: true, unit: 'kg' });

console.log(JSON.stringify({
    result: 'PASS',
    note: 'Automated protocol/policy checks passed; physical certification remains required where marked.',
    matrix: getHardwareCertificationMatrix(),
}, null, 2));
