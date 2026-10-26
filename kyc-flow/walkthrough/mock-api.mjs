export const USER_ID = "sakour";
export const CO = "BI_NEGT";
export const OTP = "22041";
export const REQNO = 88421;
export const CUSTCODE = "L0088421";
export const CUSTNAME = "Horizon Auto Parts LLC";

const blocked = [];
let phase = "start";

export function setPhase(next) {
  phase = next;
}
export function getPhase() {
  return phase;
}
export function blockedCalls() {
  return blocked;
}

function field(sno, section, sectionName, order, key, label, type, extra = {}) {
  return {
    FORM_DATA: "",
    REMARKS: "",
    SNO: sno,
    SECTION_ID: section,
    SECTION_SNO: section,
    SECTION_NAME: sectionName,
    SECTION_DISPLAY_ORDER: section,
    FIELD_KEY: key,
    LABEL: label,
    FIELD_TYPE: type,
    DISPLAY_ORDER: order,
    WIDTH: "half",
    IS_REQUIRED: extra.required ?? 1,
    IS_ACTIVE: 1,
    PLACEHOLDER: extra.placeholder || label,
    HELP_TEXT: "",
    DEFAULT_VALUE: "",
    OPTIONS_JSON: extra.options || "[]",
    VALIDATION_JSON: "",
    DELETED: "N",
    CREATED_AT: "2026-01-12",
    UPDATED_AT: "2026-01-12",
    CREATEDBY: "sakour",
    UPDATEDBY: "sakour",
    REQNO,
  };
}

const MASTER = [
  field(1, 1, "Company profile", 1, "legal_name", "Legal name", "text"),
  field(2, 1, "Company profile", 2, "trade_licence", "Trade licence", "text"),
  field(3, 1, "Company profile", 3, "trn", "Tax registration number", "text"),
  field(4, 1, "Company profile", 4, "activity", "Business activity", "textarea", { required: 0 }),
  field(5, 2, "Bank details", 1, "bank", "Bank name", "text"),
  field(6, 2, "Bank details", 2, "iban", "IBAN", "text"),
  field(7, 3, "Ownership", 1, "owner", "Beneficial owner", "text"),
  field(8, 3, "Ownership", 2, "share", "Ownership percent", "text"),
];

const FORM_DATA = JSON.stringify({
  "1_legal_name": CUSTNAME,
  "1_trade_licence": "CN-784221",
  "1_trn": "100247821900003",
  "1_activity": "Wholesale of motor vehicle parts",
  "2_bank": "Emirates NBD",
  "2_iban": "AE070331234567890123456",
  "3_owner": "Khalid Al Mansoori",
  "3_share": "100",
});

function pendingRow(extra = {}) {
  return {
    CUSTCODE1: CUSTCODE,
    CUSTSUBMITDATE: "2026-10-19",
    CardCode: CUSTCODE,
    CardName: CUSTNAME,
    SLPNAME: "Jad Sakour",
    CardType: "L",
    E_Mail: "sakour@neweast.co",
    Phone1: "+97145001000",
    GroupCode: "Local",
    Currency: "AED",
    LicTradNum: "100247821900003",
    Phone2: "",
    Cellular: "+971501112244",
    REQNO,
    CREATEDATE: "2026-10-19",
    CREATEDBY: "Jad Sakour",
    CREATEDBYID: USER_ID,
    CREATEDBYDEPT: "Sales",
    CUSTNAME,
    CUSTCODE,
    CUSTTYPE: "Credit",
    CONTACTPERSON: "Khalid Al Mansoori",
    CUSTOMER: "L",
    CUSTGROUP: "Local",
    CUSTCURRENCY: "AED",
    CUSTTAXID: "100247821900003",
    REQSTATUS: extra.REQSTATUS || "Pending",
    CURRENTSTAGE: extra.CURRENTSTAGE || 1,
    APPROVEDUSERID: null,
    APPROVEDUSERNAME: null,
    APPROVEDUSERLOG: null,
    SLNO: 1,
    HDSLNO: 1,
    APPROVERUSERID: USER_ID,
    APPROVELUSERNAME: "Jad Sakour",
    APPROVERSTAGE: extra.APPROVERSTAGE || 1,
    APPROVERSTATUS: "Pending",
    NEXTAPPROVER: extra.NEXTAPPROVER || "",
    APPROVERLOG: null,
    REMARKS: null,
    APPROVALSTAGE: extra.APPROVALSTAGE || 1,
    USERID: USER_ID,
    USERNAME: "Jad Sakour",
    APPROVEREMARKS: "",
    CREDITTERMS: "50000",
    LEADREMARKS: "New account for spare parts",
    MANAGERAPPROVE: extra.MANAGERAPPROVE || null,
    MANAGERSTATUS: extra.MANAGERSTATUS || "",
    ESCALATEDTO: extra.ESCALATEDTO || "",
    ESCALATEDTOID: extra.ESCALATEDTOID || "",
    ESCALATEDTOMAIL: extra.ESCALATEDTOMAIL || "",
    ESCALATEDTOLOG: "",
    ESCALATED: extra.ESCALATED || null,
    ESCALATIONAPPROVED: extra.ESCALATIONAPPROVED || null,
    ESCALATIONAPPROVEDLOG: "",
    ESCALATIONAPPROVEDREMARKS: "",
    ESCALATEDREMARKS: extra.ESCALATEDREMARKS || "",
    ESCALATEDBY: extra.ESCALATEDBY || "",
    ESCALATEDBYID: extra.ESCALATEDBYID || "",
    ESCALATEDBYEMAIL: extra.ESCALATEDBYEMAIL || "",
  };
}

function lead() {
  const submitted = ["kycSubmitted", "salesApproved", "managerApproved", "finance1", "financeLast", "escalated", "done"].includes(phase);
  const salesY = ["salesApproved", "managerApproved", "finance1", "financeLast", "escalated", "done"].includes(phase);
  const mgrY = ["managerApproved", "finance1", "financeLast", "escalated", "done"].includes(phase);
  const sent = phase !== "start";
  return {
    MANAGERAPPROVE: mgrY ? "Y" : null,
    CUSTSUBMIT: submitted ? "Y" : null,
    REQNO,
    CREATEDATE: "2026-10-19T09:12:00",
    KYCSENT: sent ? "Y" : null,
    SALESAPPROVE: salesY ? "Y" : null,
    SLPNAME: "Jad Sakour",
    CREATEDBY: "Jad Sakour",
    CREATEDBYID: USER_ID,
    CREATEDBYDEPT: "Sales",
    CUSTNAME,
    CUSTCODE,
    CUSTTYPE: "Credit",
    CONTACTPERSON: "Khalid Al Mansoori",
    CUSTOMER: "L",
    CUSTGROUP: "Local",
    CUSTCURRENCY: "AED",
    CUSTTAXID: "100247821900003",
    REQSTATUS: phase === "done" ? "Approved" : "Pending",
    PAYTERMS: "30 Days",
    CUSTCODE1: CUSTCODE,
    LEADREMARKS: "New account for spare parts",
    CREDITLIMIT: "100000",
    CREDITTERMS: "50000",
    UPDATEDBY: "Jad Sakour",
    UPDATEDDATE: "2026-10-19T09:12:00",
    EMAIL: "sakour@neweast.co",
    MOBILE: "+971501112244",
    OCRD_ID: 0,
    TEL1: "+97145001000",
    TEL2: "",
    ADDRESS1: "Showroom 12",
    ADDRESS2: "Al Quoz Industrial 1",
    ADDRESS3: "",
    COUNTRY: "AE",
    CITY: "Dubai",
    ZIPCODE: "00000",
    STREET: "12",
    BUILDING: "Horizon Building",
    BLOCK: "Al Quoz",
    GEOLOCATION: "Al Quoz Industrial 1, Dubai",
    FAX: "",
    SLPCODE: "12",
    REPORTINGTOID: USER_ID,
    REPORTINGTONAME: "Jad Sakour",
    MANAGERREMARKS: mgrY ? "Proceed to Finance" : "",
    ESCALATED: phase === "escalated" || phase === "done" ? "Y" : null,
    ESCALATEDTO: phase === "escalated" || phase === "done" ? "Jad Sakour" : "",
    ESCALATEDTOID: phase === "escalated" || phase === "done" ? USER_ID : "",
    ESCALATEDTOMAIL: phase === "escalated" || phase === "done" ? "sakour@neweast.co" : "",
    ESCALATIONAPPROVED: phase === "done" ? "Y" : null,
  };
}

function json(status, body) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

export function fulfillFor(url, method, postData) {
  const u = url.toLowerCase();
  const body = postData || "";
  const isWrite =
    /\/add-lead-customer(?:\?|$)|\/edit-lead(?:\?|$)|\/sales-approve(?:\?|$)|\/sales-reject(?:\?|$)|\/manager-approve(?:\?|$)|\/manager-reject(?:\?|$)|\/customer-approve(?:\?|$)|\/customer-reject(?:\?|$)|\/kyc-aml\/escalate(?:\?|$)|\/escalation-approve(?:\?|$)|\/escalation-reject(?:\?|$)|\/insert-kyc-data(?:\?|$)|\/save-kyc-data(?:\?|$)|\/send-kyc-link-mail(?:\?|$)|\/send-mail(?:\?|$)|\/businesspartner(?:\?|$)|\/convertlead(?:\?|$)|generate-otp|\/update-section-remarks(?:\?|$)|\/add-comments(?:\?|$)|\/update-attached-files(?:\?|$)|\/insert-master/i.test(
      u,
    );

  if (isWrite) {
    blocked.push({ method, url, at: Date.now() });
    if (/sales-approve/i.test(u)) phase = "salesApproved";
    else if (/manager-approve/i.test(u)) phase = "managerApproved";
    else if (/add-lead-customer/i.test(u)) phase = "leadCreated";
    else if (/send-kyc|send-mail/i.test(u)) phase = "kycSent";
    else if (/insert-kyc/i.test(u)) phase = "kycSubmitted";
    else if (/\/escalate/i.test(u) && !/escalation-approve/i.test(u)) phase = "escalated";
    else if (/escalation-approve|convertlead/i.test(u)) phase = "done";
    else if (/customer-approve/i.test(u)) phase = phase === "managerApproved" ? "financeLast" : "financeLast";
    if (/businesspartner/i.test(u) || /convertlead/i.test(u)) {
      return json(200, { Code: "200", Cardcode: CUSTCODE, Message: "ok" });
    }
    if (/generate-otp|verify-otp|validateotp/i.test(u) || /auth\/generate-otp/i.test(u)) {
      return json(200, { ValidateOTPResult: { Output: "Success" } });
    }
    return json(200, { result: [{ Status: "Success" }], Code: "200" });
  }

  if (/generate-otp|verifyotp|verify-otp/i.test(u) || /auth\/generate-otp/i.test(u)) {
    blocked.push({ method, url, at: Date.now() });
    return json(200, { ValidateOTPResult: { Output: "Success" } });
  }

  if (/requester-info/i.test(u)) {
    return json(200, {
      result: [
        {
          USER_ID,
          EMP_ID: 220414,
          EMP_FULLNAME: "Jad Sakour",
          APPROVALS: 1,
          USER_EMAIL: "sakour@neweast.co",
          USER_MOBILE1: "+971501112244",
          CO,
          ORACLEEMPID: "220414",
          DEPARTMENT: "Sales",
          DEPTCODE: 10,
          PAYREQ_SHOWCONFDOC: "N",
          SHOWALLDEPT: "Y",
        },
      ],
    });
  }

  if (/emp-info|employee-info|get-emp/i.test(u) || /shared-services\/emp/i.test(u)) {
    return json(200, [
      {
        EMPCODE: USER_ID,
        EMP_FULLNAME: "Jad Sakour",
        REPORTINGTOID: USER_ID,
        REPORTINGTONAME: "Jad Sakour",
        HLEVEL4USERID: USER_ID,
        HLEVEL4USERNAME: "Jad Sakour",
        EMAIL: "sakour@neweast.co",
      },
    ]);
  }

  if (/get-slp-codes/i.test(u)) {
    return json(200, { result: [{ SlpCode: 12, SlpName: "Jad Sakour" }] });
  }
  if (/get-slpname/i.test(u)) {
    return json(200, { result: [{ SlpCode: 12, SlpName: "Jad Sakour" }] });
  }
  if (/get-payterms|get-creditlimit/i.test(u)) {
    return json(200, { result: [{ GroupNum: 1, PymntGroup: "30 Days" }] });
  }
  if (/get-vendor-currency/i.test(u)) {
    return json(200, {
      result: [
        { CurrCode: "AED", CurrName: "UAE Dirham" },
        { CurrCode: "USD", CurrName: "US Dollar" },
      ],
    });
  }
  if (/check-matrix/i.test(u)) {
    return json(200, { result: [{ USER_ID, REQNO }] });
  }
  if (/get-master-form/i.test(u)) {
    if (/Fetch_kyc_data/i.test(body)) {
      if (!["kycSubmitted", "salesApproved", "managerApproved", "finance1", "financeLast", "escalated", "done"].includes(phase)) {
        return json(200, { result: [] });
      }
      return json(200, {
        result: [
          {
            SNO: 9,
            CARDCODE: CUSTCODE,
            CARDNAME: CUSTNAME,
            FORM_DATA,
            SUBMITTED_AT: "2026-10-19T10:40:00",
          },
        ],
      });
    }
    if (/Fetch_escalation_master/i.test(body)) {
      return json(200, { result: [{ USER_ID, USER_NAME: "Jad Sakour", SNO: 1, EMP_FULLNAME: "Jad Sakour" }] });
    }
    if (/Fetch_section_remarks/i.test(body)) {
      return json(200, { result: [] });
    }
    return json(200, { result: MASTER });
  }
  if (/master-form-sections/i.test(u)) {
    return json(200, { result: [{ SECTION: "Company profile" }, { SECTION: "Bank details" }, { SECTION: "Ownership" }] });
  }
  if (/get-customer-kyc/i.test(u)) {
    return json(200, {
      result: [
        {
          CustCode: CUSTCODE,
          REQNO,
          CustName: CUSTNAME,
          E_Mail: "sakour@neweast.co",
          PaymentTerms: "30 Days",
          SlpCode: 12,
          SlpName: "Jad Sakour",
          COUNTRYINCORPNAME: "United Arab Emirates",
          MOBILE: "+971501112244",
          STATUS: "Lead",
          CREATEDBYID: USER_ID,
        },
      ],
    });
  }
  if (/get-lead-customers/i.test(u)) {
    if (phase === "start") return json(200, { result: [] });
    return json(200, { result: [lead()] });
  }
  if (/get-lead-data/i.test(u)) {
    return json(200, { result: [lead()] });
  }
  if (/get-pending-approvals/i.test(u)) {
    if (!["managerApproved", "finance1", "financeLast"].includes(phase)) return json(200, { result: [] });
    return json(200, { result: [pendingRow({ APPROVALSTAGE: phase === "financeLast" ? 2 : 1, APPROVERSTAGE: phase === "financeLast" ? 2 : 1, MANAGERAPPROVE: "Y" })] });
  }
  if (/get-manager-approvals/i.test(u)) {
    if (!["salesApproved", "managerApproved"].includes(phase)) return json(200, { result: [] });
    return json(200, { result: [pendingRow({ MANAGERAPPROVE: null, SALESAPPROVE: "Y" })] });
  }
  if (/get-current-approver/i.test(u)) {
    const last = phase === "financeLast" || phase === "escalated" || phase === "done";
    return json(200, { result: [pendingRow({ APPROVALSTAGE: last ? 2 : 1, USERID: USER_ID, USERNAME: "Jad Sakour" })] });
  }
  if (/get-next-approvers/i.test(u)) {
    if (phase === "managerApproved" || phase === "finance1") {
      return json(200, { result: [pendingRow({ APPROVALSTAGE: 2, USERID: USER_ID, USERNAME: "Jad Sakour" })] });
    }
    return json(200, { result: [] });
  }
  if (/get-escalations/i.test(u)) {
    if (phase !== "escalated" && phase !== "done") return json(200, { result: [] });
    return json(200, { result: [pendingRow({ ESCALATED: "Y", ESCALATEDTO: "Jad Sakour", ESCALATEDTOID: USER_ID, ESCALATEDTOMAIL: "sakour@neweast.co" })] });
  }
  if (/get-approval-history|get-all-approval|get-escalation-history/i.test(u)) {
    return json(200, { result: [] });
  }
  if (/fetch-docs|get-attached|comments/i.test(u)) {
    return json(200, { result: [] });
  }

  if (method === "GET") return json(200, []);
  return json(200, { result: [] });
}

export function shouldIntercept(url) {
  return /ppapi\.neweast\.cloud|auth\.neweast\.cloud|bi\.neweast\.cloud|teams\.microsoft|graph\.microsoft|outlook\.office/i.test(url);
}
