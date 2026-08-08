export interface PlatformDeliveryDraft {
  customerName: string;
  customerPhone: string;
  address: string;
}

export const isPlatformDeliveryValid = (
  externalOrderNumber: string,
  draft: PlatformDeliveryDraft,
) => {
  const phoneDigitCount = draft.customerPhone.match(/\p{Number}/gu)?.length ?? 0;
  return externalOrderNumber.trim().length > 0
    && draft.customerName.trim().length >= 2
    && phoneDigitCount >= 7
    && draft.address.trim().length >= 5;
};
