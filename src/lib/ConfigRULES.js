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
                value: "NHS Breast Programme",
                caseSensitive: false,
              },
            ],
            thenValue: "Mammogram",
            isKilled: false,
          },
          /** adding dummy data for testing */
          {
            rootLogicType: "AND",
            rules: [
              {
                id: "09b8f37c-364f-43b2-a7bb-ced6fd9b3b68",
                type: "condition",
                field: "department",
                operator: "contains",
                value: "Breast Screening",
                caseSensitive: false,
              },
            ],
            thenValue: "Test Letter Type",
            isKilled: false,
          },
        ],
        elseValue: "var(letter_type)",
        isKilled: false,
      },
      // "letter_type": {
      //   "type": "cascading-advanced",
      //   "clauses": [
      //     {
      //       "rootLogicType": "OR",
      //       "rules": [
      //         {
      //           "id": "941bdc75-b509-4308-9526-1c9e932bdf52",
      //           "type": "condition",
      //           "field": "hospital_name",
      //           "operator": "contains",
      //           "value": "aaaa",
      //           "caseSensitive": false
      //         },
      //         {
      //           "id": "d5f99718-a37b-4c69-bea4-8a094129d2ac",
      //           "type": "condition",
      //           "field": "department",
      //           "operator": "contains",
      //           "value": "bbbb",
      //           "caseSensitive": false
      //         },
      //         {
      //           "id": "8b7a29f0-dfcb-41d2-b59e-50533bcc4464",
      //           "type": "group",
      //           "logicType": "AND",
      //           "rules": [
      //             {
      //               "id": "13962362-619f-45b1-be9b-283817e1bf76",
      //               "type": "condition",
      //               "field": "letter_type",
      //               "operator": "contains",
      //               "value": "cccc",
      //               "caseSensitive": false
      //             },
      //             {
      //               "id": "fdacfc88-eee7-406e-b64b-0f0ee5046029",
      //               "type": "condition",
      //               "field": "rpa_note",
      //               "operator": "contains",
      //               "value": "dddd",
      //               "caseSensitive": false
      //             }
      //           ]
      //         }
      //       ],
      //       "thenValue": "true",
      //       "isKilled": false
      //     },
      //     {
      //       "rootLogicType": "AND",
      //       "rules": [
      //         {
      //           "id": "4129f9ef-d7f5-4e26-b560-87a1d48a18e7",
      //           "type": "condition",
      //           "field": "result",
      //           "operator": "equals",
      //           "value": "true",
      //           "caseSensitive": false
      //         }
      //       ],
      //       "thenValue": "true",
      //       "isKilled": false
      //     }
      //   ],
      //   "elseValue": "false",
      //   "isKilled": true
      // },
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
