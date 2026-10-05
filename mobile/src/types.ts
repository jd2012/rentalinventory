export type Mode = 'checkout' | 'return' | 'inventory';

export type Rental = {
  id: string;
  passId: string;
  outTime: string;
  status: string;
};

export type GearItem = {
  barcode: string;
  type?: string;
  size?: string;
  status?: string;
  passId?: string;
  rentalId?: string;
  outTime?: string;
  endOfLifeDate?: string;
};

export type Stats = {
  totalOut: number;
  openRentals: number;
  lastAction: string;
};
