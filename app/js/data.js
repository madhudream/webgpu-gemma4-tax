// ─────────────────────────────────────────────────────────────────────────────
// data.js — Tax form definitions and known-issue database
// ─────────────────────────────────────────────────────────────────────────────

export const FORMS = {

  'W-2': {
    title: 'W-2 — Wage and Tax Statement',
    meta: 'Tax Year 2024  ·  Dept. of the Treasury — IRS',
    sections: [
      { label: 'Employer Information', fields: [
        { box: 'a',   label: "Employee's social security number",         type: 'text',   ph: '000-00-0000' },
        { box: 'b',   label: 'Employer identification number (EIN)',      type: 'text',   ph: '00-0000000' },
        { box: 'c',   label: "Employer's name, address, and ZIP code",    type: 'area',   ph: 'Employer Name\n123 Main St\nCity, ST 00000', span2: true },
      ]},
      { label: 'Wages & Withholding', fields: [
        { box: '1',   label: 'Wages, tips, other compensation',           type: 'number', ph: '0.00' },
        { box: '2',   label: 'Federal income tax withheld',               type: 'number', ph: '0.00' },
        { box: '3',   label: 'Social security wages',                     type: 'number', ph: '0.00' },
        { box: '4',   label: 'Social security tax withheld',              type: 'number', ph: '0.00' },
        { box: '5',   label: 'Medicare wages and tips',                   type: 'number', ph: '0.00' },
        { box: '6',   label: 'Medicare tax withheld',                     type: 'number', ph: '0.00' },
        { box: '12a', label: 'Codes (see back of form)',                  type: 'text',   ph: 'e.g. DD 1234.00' },
        { box: '13',  label: 'Statutory employee / Third-party sick pay', type: 'text',   ph: 'Check applicable boxes' },
      ]},
      { label: 'Employee Information', fields: [
        { box: 'e',   label: "Employee's first name and middle initial",  type: 'text',   ph: 'John A.' },
        { box: 'e2',  label: "Employee's last name",                      type: 'text',   ph: 'Doe' },
        { box: 'f',   label: "Employee's address and ZIP code",           type: 'area',   ph: '456 Elm Ave\nCity, ST 00000', span2: true },
      ]},
      { label: 'State & Local', fields: [
        { box: '15',  label: 'State / Employer state ID number',          type: 'text',   ph: 'ST / 000000' },
        { box: '16',  label: 'State wages, tips, etc.',                   type: 'number', ph: '0.00' },
        { box: '17',  label: 'State income tax',                          type: 'number', ph: '0.00' },
        { box: '18',  label: 'Local wages, tips, etc.',                   type: 'number', ph: '0.00' },
      ]},
    ],
  },

  '1099-MISC': {
    title: '1099-MISC — Miscellaneous Information',
    meta: 'Tax Year 2024  ·  Dept. of the Treasury — IRS',
    hasIssues: true,
    sections: [
      { label: 'Payer & Recipient', fields: [
        { box: 'PAYER',      label: "PAYER'S name, address, city, state, ZIP, phone", type: 'area', ph: 'Payer Co.\n789 Biz Blvd\nCity, ST 00000', span2: true },
        { box: 'PAYER TIN',  label: "PAYER'S TIN",                                    type: 'text',   ph: '00-0000000' },
        { box: 'RECIP TIN',  label: "RECIPIENT'S TIN",                                type: 'text',   ph: '000-00-0000' },
        { box: 'RECIPIENT',  label: "RECIPIENT'S name, address, ZIP",                 type: 'area',   ph: 'Name\n123 St\nCity, ST', span2: true },
        { box: 'Acct No.',   label: 'Account number (optional)',                       type: 'text',   ph: '' },
      ]},
      { label: 'Income Boxes', fields: [
        { box: '1',  label: 'Rents',                                                   type: 'number', ph: '0.00' },
        { box: '2',  label: 'Royalties',                                               type: 'number', ph: '0.00' },
        { box: '3',  label: 'Other income',                                            type: 'number', ph: '0.00' },
        { box: '4',  label: 'Federal income tax withheld',                             type: 'number', ph: '0.00' },
        { box: '5',  label: 'Section 409A deferrals',                                  type: 'number', ph: '0.00' },
        { box: '6',  label: 'Medical and health care payments',                        type: 'number', ph: '0.00' },
        { box: '8',  label: 'Substitute payments in lieu of dividends',                type: 'number', ph: '0.00' },
        { box: '10', label: 'Crop insurance proceeds',                                 type: 'number', ph: '0.00' },
        { box: '14', label: 'Gross proceeds paid to an attorney',                      type: 'number', ph: '0.00' },
      ]},
      { label: 'State', fields: [
        { box: '15', label: 'State tax withheld',                                      type: 'number', ph: '0.00' },
        { box: '16', label: 'State / Payer state no.',                                 type: 'text',   ph: 'ST / 000000' },
        { box: '17', label: 'State income',                                            type: 'number', ph: '0.00' },
      ]},
    ],
  },

  '1099-NEC': {
    title: '1099-NEC — Nonemployee Compensation',
    meta: 'Tax Year 2024  ·  Dept. of the Treasury — IRS',
    hasIssues: true,
    sections: [
      { label: 'Payer & Recipient', fields: [
        { box: 'PAYER',     label: "PAYER'S name, address, city, state, ZIP, phone",  type: 'area', ph: 'Payer Co.\n789 Biz Blvd\nCity, ST 00000', span2: true },
        { box: 'PAYER TIN', label: "PAYER'S TIN",                                     type: 'text', ph: '00-0000000' },
        { box: 'RECIP TIN', label: "RECIPIENT'S TIN",                                 type: 'text', ph: '000-00-0000' },
        { box: 'RECIPIENT', label: "RECIPIENT'S name, address, ZIP",                  type: 'area', ph: 'Name\n123 St\nCity, ST', span2: true },
        { box: 'Acct No.',  label: 'Account number (optional)',                        type: 'text', ph: '' },
      ]},
      { label: 'Compensation & Withholding', fields: [
        { box: '1', label: 'Nonemployee compensation',                                 type: 'number', ph: '0.00' },
        { box: '4', label: 'Federal income tax withheld',                              type: 'number', ph: '0.00' },
      ]},
      { label: 'State', fields: [
        { box: '5', label: 'State tax withheld',                                       type: 'number', ph: '0.00' },
        { box: '6', label: 'State / Payer state no.',                                  type: 'text',   ph: 'ST / 000000' },
        { box: '7', label: 'State income',                                             type: 'number', ph: '0.00' },
      ]},
    ],
  },

  '1099-INT': {
    title: '1099-INT — Interest Income',
    meta: 'Tax Year 2024  ·  Dept. of the Treasury — IRS',
    hasIssues: true,
    sections: [
      { label: 'Payer & Recipient', fields: [
        { box: 'PAYER',     label: "PAYER'S name, address, city, state, ZIP, phone",  type: 'area', ph: 'Bank Name\n123 Finance St\nCity, ST 00000', span2: true },
        { box: 'PAYER TIN', label: "PAYER'S TIN",                                     type: 'text', ph: '00-0000000' },
        { box: 'RECIP TIN', label: "RECIPIENT'S TIN",                                 type: 'text', ph: '000-00-0000' },
        { box: 'RECIPIENT', label: "RECIPIENT'S name, address, ZIP",                  type: 'area', ph: 'Name\n123 St\nCity, ST', span2: true },
      ]},
      { label: 'Interest Income Boxes', fields: [
        { box: '1',  label: 'Interest income',                                                          type: 'number', ph: '0.00' },
        { box: '2',  label: 'Early withdrawal penalty',                                                 type: 'number', ph: '0.00' },
        { box: '3',  label: 'Interest on U.S. Savings Bonds and Treasury obligations',                  type: 'number', ph: '0.00' },
        { box: '4',  label: 'Federal income tax withheld',                                              type: 'number', ph: '0.00' },
        { box: '5',  label: 'Investment expenses',                                                      type: 'number', ph: '0.00' },
        { box: '8',  label: 'Tax-exempt interest',                                                      type: 'number', ph: '0.00' },
        { box: '10', label: 'Market discount',                                                          type: 'number', ph: '0.00' },
        { box: '11', label: 'Bond premium',                                                             type: 'number', ph: '0.00' },
        { box: '13', label: 'Bond premium on Treasury obligations',                                     type: 'number', ph: '0.00' },
      ]},
      { label: 'State', fields: [
        { box: '14', label: 'State tax withheld',                                      type: 'number', ph: '0.00' },
        { box: '15', label: 'State / Payer state no.',                                 type: 'text',   ph: 'ST / 000000' },
        { box: '16', label: 'State income',                                            type: 'number', ph: '0.00' },
      ]},
    ],
  },

  '1099-DIV': {
    title: '1099-DIV — Dividends and Distributions',
    meta: 'Tax Year 2024  ·  Dept. of the Treasury — IRS',
    hasIssues: false,
    sections: [
      { label: 'Payer & Recipient', fields: [
        { box: 'PAYER',     label: "PAYER'S name, address, city, state, ZIP, phone",  type: 'area', ph: 'Brokerage Name\n100 Wall St\nNew York, NY 10005', span2: true },
        { box: 'PAYER TIN', label: "PAYER'S TIN",                                     type: 'text', ph: '00-0000000' },
        { box: 'RECIP TIN', label: "RECIPIENT'S TIN",                                 type: 'text', ph: '000-00-0000' },
        { box: 'RECIPIENT', label: "RECIPIENT'S name, address, ZIP",                  type: 'area', ph: 'Name\n123 St\nCity, ST', span2: true },
      ]},
      { label: 'Dividend Boxes', fields: [
        { box: '1a', label: 'Total ordinary dividends',                                type: 'number', ph: '0.00' },
        { box: '1b', label: 'Qualified dividends',                                     type: 'number', ph: '0.00' },
        { box: '2a', label: 'Total capital gain distributions',                        type: 'number', ph: '0.00' },
        { box: '2b', label: 'Unrecaptured Section 1250 gain',                          type: 'number', ph: '0.00' },
        { box: '3',  label: 'Nondividend distributions',                               type: 'number', ph: '0.00' },
        { box: '4',  label: 'Federal income tax withheld',                             type: 'number', ph: '0.00' },
        { box: '5',  label: 'Section 199A dividends',                                  type: 'number', ph: '0.00' },
        { box: '6',  label: 'Investment expenses',                                     type: 'number', ph: '0.00' },
      ]},
      { label: 'State', fields: [
        { box: '14', label: 'State tax withheld',                                      type: 'number', ph: '0.00' },
        { box: '15', label: 'State / Payer state no.',                                 type: 'text',   ph: 'ST / 000000' },
        { box: '16', label: 'State income',                                            type: 'number', ph: '0.00' },
      ]},
    ],
  },

  '1040': {
    title: '1040 — U.S. Individual Income Tax Return',
    meta: 'Tax Year 2024  ·  Dept. of the Treasury — IRS',
    hasIssues: false,
    sections: [
      { label: 'Taxpayer Information', fields: [
        { box: 'name',   label: 'Your first name and middle initial',                  type: 'text',   ph: 'John A.' },
        { box: 'last',   label: 'Last name',                                           type: 'text',   ph: 'Doe' },
        { box: 'SSN',    label: 'Your social security number',                         type: 'text',   ph: '000-00-0000' },
        { box: 'DOB',    label: 'Date of birth',                                       type: 'text',   ph: 'MM/DD/YYYY' },
        { box: 'addr',   label: 'Home address (number, street, apt)',                  type: 'text',   ph: '123 Main St Apt 4', span2: true },
        { box: 'city',   label: 'City, town, state, and ZIP',                         type: 'text',   ph: 'City, ST 00000', span2: true },
        { box: 'status', label: 'Filing Status', type: 'select',
          opts: ['Single','Married filing jointly','Married filing separately','Head of household','Qualifying surviving spouse'] },
      ]},
      { label: 'Income', fields: [
        { box: '1a',  label: 'Total amount from W-2 Box 1',                            type: 'number', ph: '0.00' },
        { box: '2b',  label: 'Taxable interest (from Schedule B)',                     type: 'number', ph: '0.00' },
        { box: '3b',  label: 'Ordinary dividends (from Schedule B)',                   type: 'number', ph: '0.00' },
        { box: '4b',  label: 'IRA distributions — taxable amount',                    type: 'number', ph: '0.00' },
        { box: '7',   label: 'Capital gain or (loss)',                                 type: 'number', ph: '0.00' },
        { box: '8',   label: 'Additional income (Schedule 1, line 10)',                type: 'number', ph: '0.00' },
        { box: '11',  label: 'Adjusted gross income (AGI)',                            type: 'number', ph: '0.00' },
      ]},
      { label: 'Deductions, Tax & Credits', fields: [
        { box: '12',  label: 'Standard or itemized deductions',                        type: 'number', ph: '0.00' },
        { box: '15',  label: 'Taxable income',                                         type: 'number', ph: '0.00' },
        { box: '16',  label: 'Tax (from Tax Table or worksheet)',                      type: 'number', ph: '0.00' },
        { box: '17',  label: 'Alternative minimum tax (AMT) — Form 6251',             type: 'number', ph: '0.00' },
        { box: '24',  label: 'Total tax',                                              type: 'number', ph: '0.00' },
      ]},
      { label: 'Payments & Refund', fields: [
        { box: '25a', label: 'Federal income tax withheld — W-2',                     type: 'number', ph: '0.00' },
        { box: '25b', label: 'Federal income tax withheld — 1099',                    type: 'number', ph: '0.00' },
        { box: '26',  label: '2024 estimated tax payments',                           type: 'number', ph: '0.00' },
        { box: '33',  label: 'Total payments',                                        type: 'number', ph: '0.00' },
        { box: '35a', label: 'Amount overpaid (refund)',                              type: 'number', ph: '0.00' },
        { box: '37',  label: 'Amount you owe',                                        type: 'number', ph: '0.00' },
      ]},
    ],
  },

  'Schedule-A': {
    title: 'Schedule A — Itemized Deductions',
    meta: 'Tax Year 2024  ·  Attach to Form 1040',
    hasIssues: false,
    sections: [
      { label: 'Medical & Dental', fields: [
        { box: '1',  label: 'Medical/dental expenses',                                 type: 'number', ph: '0.00' },
        { box: '2',  label: 'Enter amount from Form 1040, line 11 (AGI)',              type: 'number', ph: '0.00' },
        { box: '4',  label: 'Medical expenses deductible (line 1 minus 7.5% AGI)',    type: 'number', ph: '0.00' },
      ]},
      { label: 'Taxes You Paid (SALT)', fields: [
        { box: '5a', label: 'State and local income taxes or general sales taxes',     type: 'number', ph: '0.00' },
        { box: '5b', label: 'State and local real estate taxes',                       type: 'number', ph: '0.00' },
        { box: '5c', label: 'State and local personal property taxes',                 type: 'number', ph: '0.00' },
        { box: '5e', label: 'Total state and local taxes (max $10,000)',               type: 'number', ph: '0.00' },
      ]},
      { label: 'Interest You Paid', fields: [
        { box: '8a', label: 'Home mortgage interest (from Form 1098)',                 type: 'number', ph: '0.00' },
        { box: '9',  label: 'Investment interest',                                    type: 'number', ph: '0.00' },
      ]},
      { label: 'Gifts to Charity', fields: [
        { box: '11', label: 'Gifts by cash or check',                                 type: 'number', ph: '0.00' },
        { box: '12', label: 'Other than by cash or check',                            type: 'number', ph: '0.00' },
        { box: '14', label: 'Carryover from prior year',                              type: 'number', ph: '0.00' },
      ]},
      { label: 'Total', fields: [
        { box: '17', label: 'Total itemized deductions',                               type: 'number', ph: '0.00', span2: true },
      ]},
    ],
  },

  'Schedule-B': {
    title: 'Schedule B — Interest and Ordinary Dividends',
    meta: 'Tax Year 2024  ·  Attach to Form 1040',
    hasIssues: false,
    sections: [
      { label: 'Part I — Interest', fields: [
        { box: '1', label: 'List name of payer and amount',                            type: 'area',   ph: 'First National Bank  ......  1,200.00\nUS Treasury  ......  340.00', span2: true },
        { box: '4', label: 'Total taxable interest — enter on Form 1040, line 2b',    type: 'number', ph: '0.00', span2: true },
      ]},
      { label: 'Part II — Ordinary Dividends', fields: [
        { box: '5', label: 'List name of payer and amount',                            type: 'area',   ph: 'Vanguard Total Market  ......  820.00', span2: true },
        { box: '6', label: 'Total ordinary dividends — enter on Form 1040, line 3b',  type: 'number', ph: '0.00', span2: true },
      ]},
      { label: 'Part III — Foreign Accounts & Trusts', fields: [
        { box: '7a', label: 'Did you have a foreign financial account?',               type: 'select', opts: ['No', 'Yes'] },
        { box: '7b', label: 'Name of foreign country',                                type: 'text',   ph: 'Leave blank if No' },
        { box: '8',  label: 'Did you receive distributions from a foreign trust?',    type: 'select', opts: ['No', 'Yes'] },
      ]},
    ],
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// Known issues database
// ─────────────────────────────────────────────────────────────────────────────

export const KNOWN_ISSUES = {

  '1099-MISC': [
    {
      sev: 'high',
      title: 'Box 7 Removed — Nonemployee Comp Moved to 1099-NEC',
      body: 'Since tax year 2020, Box 7 "Nonemployee compensation" was eliminated from 1099-MISC. All contractor/freelancer payments ≥$600 must now use Form 1099-NEC. Many payers still incorrectly use Box 3 (Other income) instead, causing recipients to miss self-employment tax obligations.',
      ref: 'IRS Notice 2021-2 · Rev. Proc. 2020-45',
    },
    {
      sev: 'high',
      title: 'Box 1 Rents vs. Box 3 Other Income Misclassification',
      body: 'Box 1 covers ALL rents — both real property and equipment/machine rentals. Box 3 is a catch-all and should not be used for rental income. Misclassifying rents into Box 3 can trigger incorrect self-employment tax treatment and IRS CP2000 matching notices.',
      ref: 'IRS Pub 527 · Treas. Reg. §1.6041-1',
    },
    {
      sev: 'medium',
      title: 'Box 6 Medical Payments — Frequently Omitted',
      body: 'Payments of $600+ to physicians, clinics, hospitals, and other health care providers must be reported in Box 6. Many payers omit these payments entirely or roll them into Box 3. This understates payer reporting and can block recipients from reconciling income.',
      ref: 'IRS Pub 15-A · IRC §6041',
    },
    {
      sev: 'medium',
      title: 'Box 4 Backup Withholding Underreported',
      body: '24% backup withholding is required when the payee failed to furnish a TIN or the IRS notified the payer of incorrect TIN. Box 4 is frequently left blank even when withholding legally applied, resulting in IRS penalties and CP2100 B-Notices.',
      ref: 'IRC §3406 · IRS Pub 1281',
    },
    {
      sev: 'low',
      title: 'State Deadline Mismatch (CA, NY, NJ)',
      body: 'Several states require 1099-MISC filing by January 31, even when the federal paper-filing deadline is February 28. Tax software often only tracks the federal deadline, causing state-level penalties that can reach $250+ per form.',
      ref: 'State DOR publications',
    },
  ],

  '1099-NEC': [
    {
      sev: 'high',
      title: 'Confusion with 1099-MISC Post-2020',
      body: 'All nonemployee compensation ($600+) must use 1099-NEC Box 1 — never 1099-MISC Box 3. A significant percentage of payers still issue 1099-MISC for freelancer/contractor payments, causing under-reporting of self-employment income and incorrect SE tax calculations for recipients.',
      ref: 'Rev. Proc. 2020-45 · IRC §1402',
    },
    {
      sev: 'high',
      title: 'Missing or Incorrect TIN — Backup Withholding Liability',
      body: 'Failure to obtain a correct TIN via Form W-9 before first payment triggers a 24% backup withholding obligation (Box 4). Issuing 1099-NEC without applying backup withholding when TIN is missing exposes the payer to IRS penalties of $310 per form plus potential interest.',
      ref: 'IRC §3406 · IRS Pub 1281',
    },
    {
      sev: 'high',
      title: 'Unified January 31 Deadline (Both Copies)',
      body: 'Unlike 1099-MISC, Form 1099-NEC has a single January 31 deadline for BOTH the recipient copy AND the IRS filing copy. Many filers incorrectly assume the IRS copy deadline is Feb 28 (paper) or Mar 31 (e-file), resulting in late-filing penalties.',
      ref: 'IRS General Instructions for Certain Information Returns (2024)',
    },
    {
      sev: 'medium',
      title: 'Corporation Exemption — Attorney Exception',
      body: 'Payments to C-corps and S-corps are generally exempt from 1099-NEC reporting — EXCEPT for attorney fees, which must always be reported regardless of entity type. Filers often either skip 1099-NEC for LLCs taxed as corps or fail to file for attorney payments.',
      ref: 'IRC §6041 · Treas. Reg. §1.6041-3',
    },
    {
      sev: 'low',
      title: 'Combined Federal/State Filing Program Coverage',
      body: 'Not all states accept 1099-NEC via the IRS Combined Federal/State Filing program. Some states require a direct state filing. Software inconsistently handles state-level 1099-NEC routing, leading to missing state filings.',
      ref: 'IRS Pub 1220',
    },
  ],

  '1099-INT': [
    {
      sev: 'high',
      title: '$10 Reporting Threshold Misunderstood — All Interest Is Taxable',
      body: "The $10 threshold is a PAYER's reporting requirement, not a taxpayer exemption. Taxpayers must report ALL interest income on their return even when no 1099-INT is received — including foreign accounts, informal loans, and amounts under $10. IRS matching catches this.",
      ref: 'IRC §6049 · IRS Pub 550 · Rev. Rul. 72-312',
    },
    {
      sev: 'high',
      title: 'Accrued Interest on Bond Purchases Incorrectly Taxed',
      body: 'When buying bonds between coupon dates, buyers pay the seller accrued interest. This accrued interest should be subtracted from the first interest payment received to avoid double-counting. Many brokers and tax software tools fail to handle this correctly.',
      ref: 'IRS Pub 550, Topic 403 · IRC §1278',
    },
    {
      sev: 'medium',
      title: 'Box 3 U.S. Treasury Interest Is State/Local Tax Exempt',
      body: 'Interest from U.S. savings bonds and Treasury obligations (Box 3) is federally taxable but exempt from ALL state and local taxes under federal law. Many tax software products fail to propagate this exemption to state returns, causing taxpayer overpayment.',
      ref: '31 USC §3124 · IRS Pub 550',
    },
    {
      sev: 'medium',
      title: 'Foreign Account Interest — FBAR & FATCA Not on 1099-INT',
      body: 'Interest from foreign financial accounts generates no 1099-INT but must be reported on Schedule B and Form 1040. Accounts exceeding $10,000 at any point also require FBAR (FinCEN 114) and possibly Form 8938. This is a frequent audit trigger.',
      ref: 'FinCEN 114 · Form 8938 · IRC §6038D',
    },
    {
      sev: 'low',
      title: 'OID vs. 1099-INT Confusion for Stripped Bonds',
      body: 'Original Issue Discount (OID) must be reported annually as ordinary income even if no cash is received; it belongs on Form 1099-OID. Some brokers incorrectly report OID amounts on 1099-INT instead, leading to misclassification of income type on the return.',
      ref: 'IRS Pub 1212 · IRC §1272',
    },
  ],

};

// ─────────────────────────────────────────────────────────────────────────────
// Mutable runtime issue store  (deep-cloned from KNOWN_ISSUES on load)
// All UI reads/writes go through these functions — KNOWN_ISSUES stays immutable.
// ─────────────────────────────────────────────────────────────────────────────

const _store = {};
Object.entries(KNOWN_ISSUES).forEach(([k, arr]) => {
  _store[k] = arr.map(i => ({ ...i }));
});

/** Return live issues for a form (empty array if none). */
export function getIssues(formKey) {
  return _store[formKey] || [];
}

/** Return form keys that currently have at least one issue. */
export function getFormKeysWithIssues() {
  return Object.keys(_store).filter(k => (_store[k] || []).length > 0);
}

/** Overwrite the issue list for a form (used by modal Save). */
export function replaceIssues(formKey, issues) {
  _store[formKey] = issues.map(i => ({ ...i }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Q&A store — loaded once from data.json, keyed by formName
// ─────────────────────────────────────────────────────────────────────────────
let _qaStore = null;

async function _loadQA() {
  if (_qaStore) return _qaStore;
  const res  = await fetch('./data.json');
  const json = await res.json();
  _qaStore = {};
  for (const entry of json.data) {
    _qaStore[entry.formName] = entry.qa; // [{ question, answer }, …]
  }
  return _qaStore;
}

/**
 * Return the Q&A array for a form key.
 * Returns [] if not found or data.json not yet loaded.
 */
export async function getQA(formKey) {
  const store = await _loadQA();
  return store[formKey] || [];
}
