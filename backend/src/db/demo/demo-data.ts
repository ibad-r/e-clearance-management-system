// Public, fictional development data. These are not confirmed university policies.
// Stable IDs make reruns additive and prevent taking ownership of unrelated rows.
export const demoData = {
  dataset: "fictional-fc-demo-v1",
  category: {
    id: "d3e00000-0000-4000-8000-000000000001",
    code: "DEMO_FC_TEACHING_V1",
    name: "Fictional FC Teaching Demo",
    isActive: true,
  },
  departments: [
    {
      id: "d3e00000-0000-4000-8000-000000000101",
      code: "DEMO_LIBRARY_V1",
      name: "Fictional Demo Library",
      isActive: true,
    },
    {
      id: "d3e00000-0000-4000-8000-000000000102",
      code: "DEMO_ASSETS_V1",
      name: "Fictional Demo Assets",
      isActive: true,
    },
  ],
  rules: [
    {
      id: "d3e00000-0000-4000-8000-000000000201",
      code: "DEMO_LIBRARY_CLEAR_V1",
      metricKey: "demo_library_items_outstanding",
      operator: "EQ",
      expectedValue: 0,
      failMessage: "Fictional demo library items remain outstanding",
      isActive: true,
    },
    {
      id: "d3e00000-0000-4000-8000-000000000202",
      code: "DEMO_ASSETS_CLEAR_V1",
      metricKey: "demo_assets_outstanding",
      operator: "EQ",
      expectedValue: 0,
      failMessage: "Fictional demo assets remain outstanding",
      isActive: true,
    },
  ],
  template: {
    id: "d3e00000-0000-4000-8000-000000000301",
    categoryId: "d3e00000-0000-4000-8000-000000000001",
    name: "Fictional FC Demo Workflow v1",
    version: 1,
    isActive: true,
  },
  stageMappings: [
    {
      id: "d3e00000-0000-4000-8000-000000000401",
      templateId: "d3e00000-0000-4000-8000-000000000301",
      departmentId: "d3e00000-0000-4000-8000-000000000101",
      ruleId: "d3e00000-0000-4000-8000-000000000201",
      stepOrder: 1,
      isRequired: true,
    },
    {
      id: "d3e00000-0000-4000-8000-000000000402",
      templateId: "d3e00000-0000-4000-8000-000000000301",
      departmentId: "d3e00000-0000-4000-8000-000000000102",
      ruleId: "d3e00000-0000-4000-8000-000000000202",
      stepOrder: 2,
      isRequired: true,
    },
  ],
  authorityPositions: [
    {
      id: "d3e00000-0000-4000-8000-000000000501",
      code: "DEMO_REVIEWER_V1",
      title: "Fictional Demo Reviewer",
      isActive: true,
    },
  ],
  approvalMappings: [
    {
      id: "d3e00000-0000-4000-8000-000000000601",
      templateId: "d3e00000-0000-4000-8000-000000000301",
      positionId: "d3e00000-0000-4000-8000-000000000501",
      stepOrder: 1,
      isRequired: true,
    },
  ],
  employees: [
    {
      id: "d3e00000-0000-4000-8000-000000000701",
      employeeNumber: "DEMO-FC-001",
      userId: null,
      categoryId: "d3e00000-0000-4000-8000-000000000001",
      fullName: "Fictional Demo Teacher One",
      designation: "Fictional Demo Lecturer",
      facultyCode: "FC",
      departmentName: "Fictional Computing Department",
      joiningDate: "2020-01-15",
    },
    {
      id: "d3e00000-0000-4000-8000-000000000702",
      employeeNumber: "DEMO-FC-002",
      userId: null,
      categoryId: "d3e00000-0000-4000-8000-000000000001",
      fullName: "Fictional Demo Teacher Two",
      designation: "Fictional Demo Lecturer",
      facultyCode: "FC",
      departmentName: "Fictional Computing Department",
      joiningDate: "2021-02-01",
    },
  ],
  departmentRecords: [
    {
      id: "d3e00000-0000-4000-8000-000000000801",
      employeeId: "d3e00000-0000-4000-8000-000000000701",
      departmentId: "d3e00000-0000-4000-8000-000000000101",
      values: { demo_library_items_outstanding: 0 },
    },
    {
      id: "d3e00000-0000-4000-8000-000000000802",
      employeeId: "d3e00000-0000-4000-8000-000000000701",
      departmentId: "d3e00000-0000-4000-8000-000000000102",
      values: { demo_assets_outstanding: 0 },
    },
    {
      id: "d3e00000-0000-4000-8000-000000000803",
      employeeId: "d3e00000-0000-4000-8000-000000000702",
      departmentId: "d3e00000-0000-4000-8000-000000000101",
      values: { demo_library_items_outstanding: 1 },
    },
    {
      id: "d3e00000-0000-4000-8000-000000000804",
      employeeId: "d3e00000-0000-4000-8000-000000000702",
      departmentId: "d3e00000-0000-4000-8000-000000000102",
      values: { demo_assets_outstanding: 2 },
    },
  ],
} as const;
