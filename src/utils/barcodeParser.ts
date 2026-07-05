/**
 * Barcode parser utility for standard and scale-encoded retail barcodes.
 */

export interface ParsedScaleBarcode {
  isScaleBarcode: boolean;
  itemCode: string;
  weightOrPrice: number;
  originalBarcode: string;
}

/**
 * Parses an EAN-13 scale barcode.
 * Standard format for in-store items:
 * Prefix (2 chars, usually '20' to '29')
 * Item Code (4 to 5 chars)
 * Weight/Price (5 chars)
 * Checksum (1 char)
 * 
 * Example: 20 1234 01500 C -> Code: 1234, Price/Weight: 15.00
 * @param code the scanned barcode string
 * @returns ParsedScaleBarcode object
 */
export function parseScaleBarcode(code: string): ParsedScaleBarcode | null {
  if (!code || typeof code !== 'string') return null;
  
  // Clean whitespace just in case
  const cleanCode = code.trim();
  
  // Typically Scale Barcodes in EAN-13 are exactly 12 or 13 digits and start with '2'
  if ((cleanCode.length === 13 || cleanCode.length === 12) && cleanCode.startsWith('2')) {
     // Let's assume a common structure:
     // Prefix: 2 chars
     // SKU: 4-5 chars
     // Value: 5 chars 
     // Checksum: 1 char (if 13 length)
     
     // E.g. '20123401500C' (12 chars + checksum)
     // To handle varied configs (e.g. 5-digit PLU vs 4-digit PLU), 
     // we can provide two common parsing tries, but usually it's fixed per store.
     // By default, many systems use CC IIIII PPPPP C (2 prefix, 5 item, 5 price, 1 check)
     // Or CC IIII PPPPP C (2 prefix, 4 item, 5 price, 1 check)
     
     // Let's extract the value part first. Usually the last digit is checksum (if length 13).
     const is13 = cleanCode.length === 13;
     const payloadEnd = is13 ? 12 : cleanCode.length;
     const payloadStart = 2; // skip '20' or '2X'
     const payload = cleanCode.substring(payloadStart, payloadEnd);
     
     // payload is 10 chars (IIIII + PPPPP) or it could be different!
     // If payload is 10 chars -> 5 for SKU, 5 for Price.
     if (payload.length === 10) {
        const itemCode = payload.substring(0, 5).replace(/^0+/, ''); // strip leading zeros for matching logic
        const valueStr = payload.substring(5, 10);
        
        // Value usually has 2 or 3 decimal places depending on configuration.
        // We'll assume 3 decimal places (e.g., 01500 = 1.500 kg or 15.00 EGP depending on if it's weight or price)
        // Actually, in Egypt it's often 2 decimal places for price or 3 for weight.
        // Let's default to dividing by 1000 for standard 3 decimal places (kg).
        const valueTokens = parseFloat(valueStr) / 1000;
        
        return {
           isScaleBarcode: true,
           itemCode: itemCode || payload.substring(0, 5), // fallback if it was all zeros
           weightOrPrice: valueTokens,
           originalBarcode: cleanCode
        };
     }
  }
  
  return null;
}
