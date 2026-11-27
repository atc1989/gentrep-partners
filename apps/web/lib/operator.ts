// Who runs the platform, for the terms and privacy pages. Set before launch; a visible [bracket] means "not set yet".
export const OPERATOR = {
  name: process.env.NEXT_PUBLIC_OPERATOR_NAME || "[operator legal name]",
  address: process.env.NEXT_PUBLIC_OPERATOR_ADDRESS || "[operator address]",
  dpo: process.env.NEXT_PUBLIC_DPO_EMAIL || "[DPO email]",
};
