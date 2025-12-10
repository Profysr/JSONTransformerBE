export const CONFIG = [
  /** UGP and Breast Clinic */
  {
    client_id: "ugp_0001",
    letter_type_from: "Breast Clinic",
    letter_type_configuration: {
      letter_type: {
        type: "cascading-advanced",
        clauses: [
          {
            rootLogicType: "AND",
            rules: [
              {
                id: "09b8f36c-364f-43b2-a7bb-ced6fd9b3b68",
                type: "condition",
                field: "hospital_name",
                operator: "contains",
                value: "NHS Breast Screening Programme",
                caseSensitive: false,
              },
            ],
            thenValue: "Mammogram",
            isKilled: true,
          },
        ],
        elseValue: "var(letter_type)",
        isKilled: false,
      },
      letter_date: "var(incident_date)",
    },
    readCodes: {
      add_readcodes: true,
      add_date_readcodes: true,
      date_type_readcodes: "letter_date",
      attach_to_problems: false,
      create_problems: false,
      add_endDate_problem: false,
    },
    forward_letter: {
      fileaway: true,
      send_task: false,
      choose_flag: false,
    },
  },
  /** UGP and Out of Hours */
  {
    client_id: "ugp_0001",
    letter_type_from: "Out of Hours",
    letter_type_configuration: {
      hospital_name: "NHS 111",
      department: "null",
    },
    readCodes: {
      add_readcodes: true,
      add_date_readcodes: true,
      date_type_readcodes: "letter_date",
      attach_to_problems: false,
      create_problems: false,
      problem_severity: "Minor",
      add_endDate_problem: false,
    },
    forward_letter: {
      forwarding_type: "Usergroup",
      forwarding_to: "Kynoby Workflow",
      send_task: false,
      choose_flag: true,
      flag_color: "Yellow",
    },
  },
];