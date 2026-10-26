CREATE TYPE "public"."approval_status" AS ENUM('WAITING', 'PENDING', 'APPROVED', 'RETURNED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."clearance_request_status" AS ENUM('PENDING_SUBMISSION', 'IN_PROGRESS', 'ACTION_REQUIRED', 'AWAITING_APPROVAL', 'RETURNED_FOR_CORRECTION', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."clearance_stage_status" AS ENUM('LOCKED', 'CHECKING', 'CLEARED', 'OUTSTANDING', 'RECHECKING', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."rule_operator" AS ENUM('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('EMPLOYEE', 'HR_OFFICER', 'APPROVER', 'SYSTEM_ADMIN');--> statement-breakpoint
CREATE TABLE "employee_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "employee_categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_number" text NOT NULL,
	"user_id" uuid,
	"category_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"designation" text NOT NULL,
	"faculty_code" text DEFAULT 'FC' NOT NULL,
	"department_name" text NOT NULL,
	"joining_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_number_unique" UNIQUE("employee_number"),
	CONSTRAINT "employees_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "authority_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "authority_members_user_position_unique" UNIQUE("user_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "authority_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "authority_positions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "clearance_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "clearance_departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "clearance_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"metric_key" text NOT NULL,
	"operator" "rule_operator" NOT NULL,
	"expected_value" jsonb NOT NULL,
	"fail_message" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "clearance_rules_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "workflow_approval_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "workflow_approval_templates_template_order_unique" UNIQUE("template_id","step_order"),
	CONSTRAINT "workflow_approval_templates_template_position_unique" UNIQUE("template_id","position_id"),
	CONSTRAINT "workflow_approval_templates_step_order_positive" CHECK ("workflow_approval_templates"."step_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_stage_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	CONSTRAINT "workflow_stage_templates_template_order_unique" UNIQUE("template_id","step_order"),
	CONSTRAINT "workflow_stage_templates_template_department_unique" UNIQUE("template_id","department_id"),
	CONSTRAINT "workflow_stage_templates_step_order_positive" CHECK ("workflow_stage_templates"."step_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_templates_category_version_unique" UNIQUE("category_id","version"),
	CONSTRAINT "workflow_templates_version_positive" CHECK ("workflow_templates"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "department_demo_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"values" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_demo_records_employee_department_unique" UNIQUE("employee_id","department_id"),
	CONSTRAINT "department_demo_records_values_object" CHECK (jsonb_typeof("department_demo_records"."values") = 'object')
);
--> statement-breakpoint
CREATE TABLE "clearance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_code" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"initiated_by_id" uuid NOT NULL,
	"status" "clearance_request_status" DEFAULT 'PENDING_SUBMISSION' NOT NULL,
	"reason_for_leaving" text NOT NULL,
	"last_working_date" date NOT NULL,
	"employee_remarks" text,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancelled_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clearance_requests_code_unique" UNIQUE("request_code"),
	CONSTRAINT "clearance_requests_cancellation_consistency_check" CHECK ((
        "clearance_requests"."status" = 'CANCELLED'
        and "clearance_requests"."cancelled_at" is not null
        and "clearance_requests"."cancelled_by_id" is not null
        and "clearance_requests"."cancellation_reason" is not null
        and length(btrim("clearance_requests"."cancellation_reason")) >= 3
      ) or (
        "clearance_requests"."status" <> 'CANCELLED'
        and "clearance_requests"."cancelled_at" is null
        and "clearance_requests"."cancelled_by_id" is null
        and "clearance_requests"."cancellation_reason" is null
      )),
	CONSTRAINT "clearance_requests_completion_consistency_check" CHECK (("clearance_requests"."status" = 'COMPLETED' and "clearance_requests"."completed_at" is not null)
        or ("clearance_requests"."status" <> 'COMPLETED' and "clearance_requests"."completed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "request_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"assigned_user_id" uuid,
	"decided_by_id" uuid,
	"step_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"status" "approval_status" DEFAULT 'WAITING' NOT NULL,
	"remarks" text,
	"approval_code" text,
	"assigned_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	CONSTRAINT "request_approvals_code_unique" UNIQUE("approval_code"),
	CONSTRAINT "request_approvals_request_order_unique" UNIQUE("request_id","step_order"),
	CONSTRAINT "request_approvals_request_position_unique" UNIQUE("request_id","position_id"),
	CONSTRAINT "request_approvals_step_order_positive_check" CHECK ("request_approvals"."step_order" > 0),
	CONSTRAINT "request_approvals_assignment_consistency_check" CHECK (("request_approvals"."assigned_user_id" is null and "request_approvals"."assigned_at" is null)
        or ("request_approvals"."assigned_user_id" is not null and "request_approvals"."assigned_at" is not null)),
	CONSTRAINT "request_approvals_pending_assignment_check" CHECK ("request_approvals"."status" <> 'PENDING' or "request_approvals"."assigned_user_id" is not null),
	CONSTRAINT "request_approvals_decision_consistency_check" CHECK ((
        "request_approvals"."status" in ('APPROVED', 'RETURNED')
        and "request_approvals"."assigned_user_id" is not null
        and "request_approvals"."decided_by_id" is not null
        and "request_approvals"."decided_at" is not null
        and "request_approvals"."decided_by_id" = "request_approvals"."assigned_user_id"
        and "request_approvals"."decided_at" >= "request_approvals"."assigned_at"
      ) or (
        "request_approvals"."status" not in ('APPROVED', 'RETURNED')
        and "request_approvals"."decided_by_id" is null
        and "request_approvals"."decided_at" is null
      )),
	CONSTRAINT "request_approvals_return_remarks_check" CHECK ("request_approvals"."status" <> 'RETURNED'
        or ("request_approvals"."remarks" is not null and length(btrim("request_approvals"."remarks")) >= 3))
);
--> statement-breakpoint
CREATE TABLE "request_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"status" "clearance_stage_status" DEFAULT 'LOCKED' NOT NULL,
	"rule_snapshot" jsonb NOT NULL,
	"checked_value" jsonb,
	"outstanding_note" text,
	"started_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "request_stages_request_order_unique" UNIQUE("request_id","step_order"),
	CONSTRAINT "request_stages_request_department_unique" UNIQUE("request_id","department_id"),
	CONSTRAINT "request_stages_step_order_positive_check" CHECK ("request_stages"."step_order" > 0),
	CONSTRAINT "request_stages_rule_snapshot_object_check" CHECK (jsonb_typeof("request_stages"."rule_snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "clearance_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_stage_id" uuid NOT NULL,
	"status" "issue_status" DEFAULT 'OPEN' NOT NULL,
	"reason" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "clearance_issues_reason_nonempty" CHECK (length(btrim("clearance_issues"."reason")) > 0),
	CONSTRAINT "clearance_issues_resolution_consistent" CHECK (("clearance_issues"."status" = 'OPEN' AND "clearance_issues"."resolved_at" IS NULL)
        OR ("clearance_issues"."status" = 'RESOLVED' AND "clearance_issues"."resolved_at" IS NOT NULL)),
	CONSTRAINT "clearance_issues_resolution_time_valid" CHECK ("clearance_issues"."resolved_at" IS NULL OR "clearance_issues"."resolved_at" >= "clearance_issues"."opened_at")
);
--> statement-breakpoint
CREATE TABLE "issue_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"submitted_by_id" uuid NOT NULL,
	"explanation" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_resolutions_explanation_nonempty" CHECK (length(btrim("issue_resolutions"."explanation")) > 0)
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"certificate_number" text NOT NULL,
	"verification_token" text NOT NULL,
	"pdf_storage_key" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "certificates_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "certificates_certificate_number_unique" UNIQUE("certificate_number"),
	CONSTRAINT "certificates_verification_token_unique" UNIQUE("verification_token"),
	CONSTRAINT "certificates_number_nonempty" CHECK (length(btrim("certificates"."certificate_number")) > 0),
	CONSTRAINT "certificates_verification_token_length" CHECK (length("certificates"."verification_token") >= 24),
	CONSTRAINT "certificates_revocation_time_valid" CHECK ("certificates"."revoked_at" IS NULL OR "certificates"."revoked_at" >= "certificates"."issued_at")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"request_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_category_id_employee_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."employee_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authority_members" ADD CONSTRAINT "authority_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authority_members" ADD CONSTRAINT "authority_members_position_id_authority_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."authority_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_templates" ADD CONSTRAINT "workflow_approval_templates_template_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approval_templates" ADD CONSTRAINT "workflow_approval_templates_position_fk" FOREIGN KEY ("position_id") REFERENCES "public"."authority_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stage_templates" ADD CONSTRAINT "workflow_stage_templates_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stage_templates" ADD CONSTRAINT "workflow_stage_templates_rule_id_clearance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."clearance_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stage_templates" ADD CONSTRAINT "workflow_stage_templates_department_fk" FOREIGN KEY ("department_id") REFERENCES "public"."clearance_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_category_id_employee_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."employee_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_demo_records" ADD CONSTRAINT "department_demo_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_demo_records" ADD CONSTRAINT "department_demo_records_department_fk" FOREIGN KEY ("department_id") REFERENCES "public"."clearance_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_requests" ADD CONSTRAINT "clearance_requests_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_approvals" ADD CONSTRAINT "request_approvals_request_id_clearance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."clearance_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_approvals" ADD CONSTRAINT "request_approvals_position_id_authority_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."authority_positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_approvals" ADD CONSTRAINT "request_approvals_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_approvals" ADD CONSTRAINT "request_approvals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_stages" ADD CONSTRAINT "request_stages_request_id_clearance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."clearance_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_stages" ADD CONSTRAINT "request_stages_department_id_clearance_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."clearance_departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearance_issues" ADD CONSTRAINT "clearance_issues_request_stage_id_request_stages_id_fk" FOREIGN KEY ("request_stage_id") REFERENCES "public"."request_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_resolutions" ADD CONSTRAINT "issue_resolutions_issue_id_clearance_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."clearance_issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_resolutions" ADD CONSTRAINT "issue_resolutions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_request_id_clearance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."clearance_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_request_id_clearance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."clearance_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_clearance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."clearance_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_faculty_category_idx" ON "employees" USING btree ("faculty_code","category_id");--> statement-breakpoint
CREATE INDEX "employees_category_id_idx" ON "employees" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "authority_members_position_active_idx" ON "authority_members" USING btree ("position_id","is_active");--> statement-breakpoint
CREATE INDEX "workflow_approval_templates_position_idx" ON "workflow_approval_templates" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "workflow_stage_templates_department_idx" ON "workflow_stage_templates" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "workflow_stage_templates_rule_idx" ON "workflow_stage_templates" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "workflow_templates_category_active_idx" ON "workflow_templates" USING btree ("category_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_templates_one_active_per_category_unique" ON "workflow_templates" USING btree ("category_id") WHERE "workflow_templates"."is_active" = true;--> statement-breakpoint
CREATE INDEX "department_demo_records_department_idx" ON "department_demo_records" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "clearance_requests_employee_status_idx" ON "clearance_requests" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "clearance_requests_status_initiated_at_idx" ON "clearance_requests" USING btree ("status","initiated_at");--> statement-breakpoint
CREATE INDEX "clearance_requests_template_id_idx" ON "clearance_requests" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "clearance_requests_initiated_by_id_idx" ON "clearance_requests" USING btree ("initiated_by_id");--> statement-breakpoint
CREATE INDEX "clearance_requests_cancelled_by_id_idx" ON "clearance_requests" USING btree ("cancelled_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clearance_requests_one_active_employee_idx" ON "clearance_requests" USING btree ("employee_id") WHERE "clearance_requests"."status" not in ('COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE INDEX "request_approvals_assigned_user_status_idx" ON "request_approvals" USING btree ("assigned_user_id","status");--> statement-breakpoint
CREATE INDEX "request_approvals_position_id_idx" ON "request_approvals" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "request_approvals_decided_by_id_idx" ON "request_approvals" USING btree ("decided_by_id");--> statement-breakpoint
CREATE INDEX "request_stages_department_id_idx" ON "request_stages" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "clearance_issues_stage_status_idx" ON "clearance_issues" USING btree ("request_stage_id","status");--> statement-breakpoint
CREATE INDEX "issue_resolutions_issue_submitted_idx" ON "issue_resolutions" USING btree ("issue_id","submitted_at");--> statement-breakpoint
CREATE INDEX "issue_resolutions_submitted_by_idx" ON "issue_resolutions" USING btree ("submitted_by_id");--> statement-breakpoint
CREATE INDEX "audit_logs_request_created_idx" ON "audit_logs" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_created_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_request_idx" ON "notifications" USING btree ("request_id");