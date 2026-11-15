CREATE TYPE "public"."student_applicability" AS ENUM('REQUIRED', 'NOT_REQUIRED', 'UNDETERMINED');--> statement-breakpoint
CREATE TYPE "public"."student_department_code" AS ENUM('LIBRARY', 'FEE_DUES', 'STUDENT_SERVICE', 'LABORATORY', 'COORDINATION_OFFICE');--> statement-breakpoint
CREATE TYPE "public"."student_department_status" AS ENUM('PENDING', 'IN_REVIEW', 'CLEARED', 'ACTION_REQUIRED', 'NOT_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."student_request_reason" AS ENUM('degree completed', 'discontinuing studies');--> statement-breakpoint
CREATE TYPE "public"."student_request_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sap_id" text NOT NULL,
	"registration_number" text NOT NULL,
	"father_name" text NOT NULL,
	"program" text NOT NULL,
	"semester" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "student_profiles_sap_id_unique" UNIQUE("sap_id"),
	CONSTRAINT "student_profiles_nonblank_fields_check" CHECK (
    length(btrim("student_profiles"."sap_id")) > 0 and "student_profiles"."sap_id" = btrim("student_profiles"."sap_id")
    and length(btrim("student_profiles"."registration_number")) > 0
    and length(btrim("student_profiles"."father_name")) > 0 and length(btrim("student_profiles"."program")) > 0
    and length(btrim("student_profiles"."semester")) > 0)
);
--> statement-breakpoint
CREATE TABLE "student_request_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"department_code" "student_department_code" NOT NULL,
	"applicability" "student_applicability" NOT NULL,
	"applicability_source" text NOT NULL,
	"status" "student_department_status" NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "student_request_departments_request_code_unique" UNIQUE("request_id","department_code"),
	CONSTRAINT "student_request_departments_source_check" CHECK (length(btrim("student_request_departments"."applicability_source")) > 0),
	CONSTRAINT "student_request_departments_state_check" CHECK (
    ("student_request_departments"."applicability" = 'REQUIRED' and "student_request_departments"."status" in ('PENDING', 'IN_REVIEW', 'CLEARED', 'ACTION_REQUIRED'))
    or ("student_request_departments"."applicability" = 'NOT_REQUIRED' and "student_request_departments"."status" = 'NOT_REQUIRED')
    or ("student_request_departments"."applicability" = 'UNDETERMINED' and "student_request_departments"."status" = 'PENDING'))
);
--> statement-breakpoint
CREATE TABLE "student_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_reference" text NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"sap_id" text NOT NULL,
	"student_name" text NOT NULL,
	"registration_number" text NOT NULL,
	"father_name" text NOT NULL,
	"program" text NOT NULL,
	"semester" text NOT NULL,
	"reason" "student_request_reason" NOT NULL,
	"status" "student_request_status" NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "student_requests_reference_unique" UNIQUE("request_reference"),
	CONSTRAINT "student_requests_closure_check" CHECK (
    ("student_requests"."status" = 'IN_PROGRESS' and "student_requests"."closed_at" is null)
    or ("student_requests"."status" in ('COMPLETED', 'CANCELLED') and "student_requests"."closed_at" is not null
      and "student_requests"."closed_at" >= "student_requests"."submitted_at")),
	CONSTRAINT "student_requests_nonblank_fields_check" CHECK (
    length(btrim("student_requests"."request_reference")) > 0 and length(btrim("student_requests"."sap_id")) > 0
    and length(btrim("student_requests"."student_name")) > 0 and length(btrim("student_requests"."registration_number")) > 0
    and length(btrim("student_requests"."father_name")) > 0 and length(btrim("student_requests"."program")) > 0
    and length(btrim("student_requests"."semester")) > 0)
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_request_departments" ADD CONSTRAINT "student_request_departments_request_id_student_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."student_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_requests" ADD CONSTRAINT "student_requests_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_requests_one_active_profile_idx" ON "student_requests" USING btree ("student_profile_id") WHERE "student_requests"."status" = 'IN_PROGRESS';--> statement-breakpoint
CREATE INDEX "student_requests_profile_submitted_idx" ON "student_requests" USING btree ("student_profile_id","submitted_at","id");