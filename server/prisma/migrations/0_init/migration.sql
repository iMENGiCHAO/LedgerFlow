-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "isSuper" BOOLEAN NOT NULL DEFAULT false,
    "deptId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "remark" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserTenant" (
    "userId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserTenant_pkey" PRIMARY KEY ("userId","tenantId")
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" INTEGER,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "targetId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "taxNo" TEXT,
    "address" TEXT,
    "legalRep" TEXT,
    "startYear" INTEGER NOT NULL,
    "startMonth" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "params" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "closedBy" INTEGER,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "category" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "isLeaf" BOOLEAN NOT NULL DEFAULT true,
    "assist" JSONB,
    "cashFlowType" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "taxNo" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "creditDays" INTEGER NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(18,2),
    "status" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deptId" INTEGER,
    "position" TEXT,
    "phone" TEXT,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SummaryLib" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SummaryLib_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitialBalance" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "partnerId" INTEGER,
    "departmentId" INTEGER,
    "projectId" INTEGER,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitialBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "word" TEXT NOT NULL DEFAULT '记',
    "no" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "totalDebit" DECIMAL(18,2) NOT NULL,
    "totalCredit" DECIMAL(18,2) NOT NULL,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "sourceType" INTEGER NOT NULL DEFAULT 0,
    "sourceId" INTEGER,
    "redForVoucherId" INTEGER,
    "rejectReason" TEXT,
    "createdBy" INTEGER NOT NULL,
    "auditedBy" INTEGER,
    "auditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherEntry" (
    "id" SERIAL NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "summary" VARCHAR(200) NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "partnerId" INTEGER,
    "departmentId" INTEGER,
    "projectId" INTEGER,
    "settleType" TEXT,
    "settleNo" TEXT,

    CONSTRAINT "VoucherEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentType" TEXT,
    "uploadedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArapBill" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "type" INTEGER NOT NULL,
    "billNo" TEXT NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "writtenOff" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memo" TEXT,
    "settleSubjectId" INTEGER,
    "invoiceId" INTEGER,
    "voucherId" INTEGER,
    "status" INTEGER NOT NULL DEFAULT 1,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArapBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArapWriteoff" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "openBillId" INTEGER NOT NULL,
    "settleBillId" INTEGER NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArapWriteoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "io" INTEGER NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "partnerId" INTEGER,
    "title" TEXT,
    "itemName" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0.13,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "arapBillId" INTEGER,
    "voucherId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementLine" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "memo" TEXT,
    "matchedEntryId" INTEGER,
    "matchedAt" TIMESTAMP(3),
    "importedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "claimNo" TEXT NOT NULL,
    "applicantId" INTEGER NOT NULL,
    "deptId" INTEGER,
    "projectId" INTEGER,
    "title" TEXT NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "currentNode" TEXT,
    "rejectReason" TEXT,
    "payVoucherId" INTEGER,
    "paidAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseClaimItem" (
    "id" SERIAL NOT NULL,
    "claimId" INTEGER NOT NULL,
    "expenseType" TEXT NOT NULL,
    "occurDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "invoiceCount" INTEGER NOT NULL DEFAULT 0,
    "invoiceTotal" DECIMAL(18,2),
    "remark" TEXT,

    CONSTRAINT "ExpenseClaimItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" SERIAL NOT NULL,
    "claimId" INTEGER NOT NULL,
    "approverId" INTEGER NOT NULL,
    "approverName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "opinion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "cardNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "acquiredDate" DATE NOT NULL,
    "originalValue" DECIMAL(18,2) NOT NULL,
    "salvageRate" DECIMAL(6,4) NOT NULL DEFAULT 0.05,
    "lifeMonths" INTEGER NOT NULL,
    "depMethod" TEXT NOT NULL DEFAULT 'straight',
    "useDeptId" INTEGER,
    "location" TEXT,
    "depExpenseSubjectId" INTEGER NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 1,
    "disposeDate" DATE,
    "disposeAmount" DECIMAL(18,2),
    "disposeType" TEXT,
    "disposeVoucherId" INTEGER,
    "acquireVoucherId" INTEGER,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRecord" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "depAmount" DECIMAL(18,2) NOT NULL,
    "accumulatedDep" DECIMAL(18,2) NOT NULL,
    "voucherId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepreciationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFormula" (
    "id" SERIAL NOT NULL,
    "reportCode" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "rowName" TEXT NOT NULL,
    "indent" INTEGER NOT NULL DEFAULT 0,
    "bold" BOOLEAN NOT NULL DEFAULT false,
    "expr" JSONB NOT NULL,
    "sort" INTEGER NOT NULL,

    CONSTRAINT "ReportFormula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");

-- CreateIndex
CREATE INDEX "OperationLog_userId_idx" ON "OperationLog"("userId");

-- CreateIndex
CREATE INDEX "Period_tenantId_status_idx" ON "Period"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Period_tenantId_year_month_key" ON "Period"("tenantId", "year", "month");

-- CreateIndex
CREATE INDEX "Subject_tenantId_parentId_idx" ON "Subject"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_tenantId_code_key" ON "Subject"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Partner_tenantId_type_idx" ON "Partner"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_tenantId_code_key" ON "Partner"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_code_key" ON "Project"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_code_key" ON "Employee"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SummaryLib_tenantId_idx" ON "SummaryLib"("tenantId");

-- CreateIndex
CREATE INDEX "InitialBalance_tenantId_subjectId_idx" ON "InitialBalance"("tenantId", "subjectId");

-- CreateIndex
CREATE INDEX "Voucher_tenantId_date_idx" ON "Voucher"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Voucher_status_idx" ON "Voucher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_tenantId_periodId_word_no_key" ON "Voucher"("tenantId", "periodId", "word", "no");

-- CreateIndex
CREATE INDEX "VoucherEntry_voucherId_idx" ON "VoucherEntry"("voucherId");

-- CreateIndex
CREATE INDEX "VoucherEntry_subjectId_idx" ON "VoucherEntry"("subjectId");

-- CreateIndex
CREATE INDEX "Attachment_ownerType_ownerId_idx" ON "Attachment"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "ArapBill_tenantId_type_partnerId_idx" ON "ArapBill"("tenantId", "type", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "ArapBill_tenantId_billNo_key" ON "ArapBill"("tenantId", "billNo");

-- CreateIndex
CREATE INDEX "ArapWriteoff_tenantId_openBillId_idx" ON "ArapWriteoff"("tenantId", "openBillId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_io_date_idx" ON "Invoice"("tenantId", "io", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNo_key" ON "Invoice"("tenantId", "invoiceNo");

-- CreateIndex
CREATE INDEX "BankAccount_tenantId_idx" ON "BankAccount"("tenantId");

-- CreateIndex
CREATE INDEX "StatementLine_tenantId_accountId_matchedEntryId_idx" ON "StatementLine"("tenantId", "accountId", "matchedEntryId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_tenantId_status_applicantId_idx" ON "ExpenseClaim"("tenantId", "status", "applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_tenantId_claimNo_key" ON "ExpenseClaim"("tenantId", "claimNo");

-- CreateIndex
CREATE INDEX "ApprovalRecord_claimId_idx" ON "ApprovalRecord"("claimId");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_status_idx" ON "FixedAsset"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_tenantId_cardNo_key" ON "FixedAsset"("tenantId", "cardNo");

-- CreateIndex
CREATE INDEX "DepreciationRecord_tenantId_periodId_idx" ON "DepreciationRecord"("tenantId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRecord_periodId_assetId_key" ON "DepreciationRecord"("periodId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportFormula_reportCode_rowKey_key" ON "ReportFormula"("reportCode", "rowKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialBalance" ADD CONSTRAINT "InitialBalance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitialBalance" ADD CONSTRAINT "InitialBalance_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_auditedBy_fkey" FOREIGN KEY ("auditedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "fk_att_voucher" FOREIGN KEY ("ownerId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArapBill" ADD CONSTRAINT "ArapBill_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArapBill" ADD CONSTRAINT "ArapBill_settleSubjectId_fkey" FOREIGN KEY ("settleSubjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArapBill" ADD CONSTRAINT "ArapBill_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_matchedEntryId_fkey" FOREIGN KEY ("matchedEntryId") REFERENCES "VoucherEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_payVoucherId_fkey" FOREIGN KEY ("payVoucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaimItem" ADD CONSTRAINT "ExpenseClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_useDeptId_fkey" FOREIGN KEY ("useDeptId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_depExpenseSubjectId_fkey" FOREIGN KEY ("depExpenseSubjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_acquireVoucherId_fkey" FOREIGN KEY ("acquireVoucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_disposeVoucherId_fkey" FOREIGN KEY ("disposeVoucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationRecord" ADD CONSTRAINT "DepreciationRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepreciationRecord" ADD CONSTRAINT "DepreciationRecord_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

