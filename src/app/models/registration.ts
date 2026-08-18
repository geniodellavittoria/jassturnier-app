export type RegistrationStatus = 'pending' | 'contacted' | 'paid';

export interface Registration {
  id: number;
  teamName: string;
  players: string[];
  contactName: string;
  contactEmail: string;
  phone: string | null;
  note: string | null;
  status: RegistrationStatus;
  createdAt: string;
}

export interface RegistrationInput {
  teamName: string;
  players: string[];
  contactName: string;
  contactEmail: string;
  phone?: string;
  note?: string;
  /** Honeypot field — must stay empty. */
  website?: string;
}

export interface PaymentSettings {
  recipientName: string | null;
  bankName: string | null;
  iban: string | null;
  referenceNote: string | null;
  amount: string | null;
  currency: string;
  deadline: string | null;
  message: string | null;
}
