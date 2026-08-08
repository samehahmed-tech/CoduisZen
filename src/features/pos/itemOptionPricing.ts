interface ItemOptionPriceInput {
  itemPrice: number;
  isOpenPrice: boolean;
  customPrice: number;
  selectedSizePrice?: number;
}

export const resolveItemOptionPrice = ({
  itemPrice,
  isOpenPrice,
  customPrice,
  selectedSizePrice,
}: ItemOptionPriceInput) => (
  isOpenPrice ? customPrice : (selectedSizePrice ?? itemPrice)
);
