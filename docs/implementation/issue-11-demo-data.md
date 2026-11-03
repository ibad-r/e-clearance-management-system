# Issue #11 development-only demo data prerequisites

These are requirements for an explicitly isolated development/demo setup, not
university policy or a seed script. No records are inserted by this document or
by application startup. Use fictional identities and a dedicated demo database;
never run demo fixtures against production or real university systems. Database
tests use only the guarded disposable PostgreSQL 18 `e_clearance_test` service.

## Minimum configuration

| Record | Required development-only properties |
| --- | --- |
| User | UUID, unique fictional email, active account, role `EMPLOYEE`; password hash must be created through the authentication owner's supported algorithm/provisioning flow |
| Employee category | Unique synthetic code/name, active |
| Employee | Unique fictional employee number, `user_id` linked to that user, matching category, `faculty_code = FC`, fictional name/designation/department |
| Workflow template | Category matches the employee, positive unique version, active; only one active template may exist per category |
| Clearance departments | Active, unique synthetic codes and display names; inclusion comes from template mappings, not a hardcoded institution-wide list |
| Clearance rules | Active synthetic code, metric key, supported operator, JSON expected value and safe failure message |
| Stage mappings | At least one configured department/rule mapping, positive unique order and explicit `isRequired`; map only active departments/rules |
| Authority positions | Active synthetic positions for configured approval steps; these are test roles, not confirmed mandatory university authorities |
| Approval mappings | Positive unique order and explicit `isRequired`; approval steps are copied as `WAITING`, without assigned users or fabricated decisions |

Category codes, department order, authorities, rules and thresholds must be labelled
as synthetic examples until confirmed by the institution. A sample metric such as
`demo_outstanding_items`, operator `EQ` and JSON expected value `0` is a test input
only. It must never be described as an actual university clearance requirement.

No dummy departmental record is needed merely to submit a case. Submission does
not query university databases or execute a rule engine. All configured stages
remain `LOCKED` and approvals remain `WAITING`. Any later departmental demo data
belongs only in `department_demo_records`; changes and rechecks need their own
authorized workflow implementation.

## Setup order and expected checks

1. Confirm the database is the explicitly approved isolated demo target. Obtain
   actual authentication provisioning from its owner; do not invent a login,
   hardcode credentials, or add an identity bypass to make demo routes usable.
2. Create the active category and active fictional user/linked FC employee.
3. Create active synthetic departments, rules and any authority positions.
4. Create an inactive versioned template and its ordered stage/approval mappings.
   Review the complete configuration, then activate it for the category.
5. After real authentication integration, submit only date, reason and optional
   remarks. The API derives employee/initiator IDs, selects the active category
   template, snapshots configuration, and records an allowlisted audit event.
6. Confirm the result is `IN_PROGRESS`, with a submission timestamp, `LOCKED`
   stages and `WAITING` approvals. A second nonterminal case for the same employee
   must return 409. `COMPLETED` and `CANCELLED` are the only terminal statuses.

Missing or inactive workflow configuration must produce a controlled 503, not
automatic fixture creation. Wrong role, inactive account or non-FC employees are
rejected; another employee's case must not be visible through an ID lookup.

## Tests and cleanup

Integration fixtures use generated UUIDs, fictional `.invalid` email addresses,
transaction rollback and savepoints. Their unusable test hashes are fixture data,
not login credentials. Do not reuse those hashes for an authenticated demo account.
No test resets, truncates or drops existing tables. Use an explicitly disposable
service/database lifecycle for demo cleanup rather than destructive application
startup behavior. Audit details must never contain passwords, hashes, auth tokens,
verification tokens or the entire submitted body.
