export const MappingCONFIG = {
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
              id: "fbb05d74-2862-48c0-b17f-783255ad3322",
              type: "condition",
              field: "hospital_name",
              operator: "contains",
              value: "NHS Breast Screening Programme",
              caseSensitive: false,
            },
          ],
          thenValue: "Mammogram",
        },
      ],
      elseValue: "Breast Clinic",
    },
    letter_date: "var(incident_date)",
  },
  rpa_note_checks: {
    is_rpa_check_found: {
      type: "cascading-advanced",
      clauses: [
        {
          rootLogicType: "AND",
          rules: [
            {
              id: "ea46afe6-540c-44c1-9132-d72c62f9267e",
              type: "condition",
              field: "rpa_note",
              operator: "contains",
              value: "Action Required",
              caseSensitive: false,
            },
          ],
          thenValue: "<<kill>>",
        },
        {
          rootLogicType: "AND",
          rules: [
            {
              id: "52340700-8ab9-4b43-aaea-b6cb1c97e0a4",
              type: "condition",
              field: "rpa_note",
              operator: "contains",
              value: "Safeguarding",
              caseSensitive: false,
            },
          ],
          thenValue: "<<kill>>",
        },
      ],
      elseValue: "false",
    },
  },
  readCodes: {
    add_readcodes: true,
    default_readcodes: "XaKqd", // this should not be present if add_readCodes is true
    add_date_readcodes: true,
    date_type_readcodes: "letter_date", // problem here
    attach_to_problems: false,
    create_problems: true,
    problem_severity: "Minor",
    add_endDate_problem: false,
  },
  forward_letter: {
    forwarding_type: "Usergroup",
    forwarding_to: "KYNOBY Workflow",
    send_task: false,
    choose_flag: true,
    flag_color: "Green",
  },
};


// export const MappingCONFIG = {
//   client_id: "mh_0001",
//   letter_type_from: "Ophthalmology",
//   letter_type_configuration: {
//     letter_type: "var(letter_type)",
//     letter_date: "var(incident_date)",
//   },
//   rpa_note_checks: {
//     flag_rpa_exceptions: true,
//     batch_name_rpa_check: {
//       type: "cascading-advanced",
//       clauses: [
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "bbbfff83-c899-4739-840d-b54aff1cd89e",
//               type: "condition",
//               field: "rpa_note",
//               operator: "contains",
//               value: "Action Required",
//               caseSensitive: false,
//             },
//           ],
//           thenValue: "Practive to Review - Urgent",
//         },
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "23fedd97-b6c8-4ded-9e38-567fedc32a5d",
//               type: "condition",
//               field: "rpa_note",
//               operator: "contains",
//               value: "Safeguarding",
//               caseSensitive: false,
//             },
//           ],
//           thenValue: "Practive to Review - Urgent",
//         },
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "90eb920b-badd-45b6-8597-77a9af17ce35",
//               type: "condition",
//               field: "rpa_note",
//               operator: "contains",
//               value: "DNACPR",
//               caseSensitive: false,
//             },
//           ],
//           thenValue: "Practive to Review - Non-Urgent",
//         },
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "1e88cd96-d6ed-4ce9-b0a6-4ea51a02de98",
//               type: "condition",
//               field: "letter_type",
//               operator: "contains",
//               value: "AAA Screening",
//               caseSensitive: false,
//             },
//             {
//               id: "ff466279-dc90-463c-b179-770ddc60f34c",
//               type: "condition",
//               field: "letter_codes",
//               operator: "contains",
//               value: "XYZ",
//               caseSensitive: true,
//             },
//           ],
//           thenValue: "Practive to Review - Urgent",
//         },
//       ],
//       elseValue: "",
//     },
//   },
//   readCodes: {
//     add_readcodes: true,
//     add_date_readcodes: true,
//     date_type_readcodes: "read_code_date",
//     attach_to_problems: true,
//     create_problems: true,
//     problem_severity: "Minor",
//     add_endDate_problem: false,
//   },
//   optional_codes: {
//     cfs: {
//       type: "cascading-advanced",
//       clauses: [
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "c5ab7102-7a89-4a66-8b16-d9c119945e2c",
//               type: "condition",
//               field: "cfs_level",
//               operator: "equals",
//               value: "0",
//               caseSensitive: false,
//             },
//           ],
//           thenValue: "Y29d0",
//         },
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "0e9a2822-1e40-4c86-bead-d64d01b1c068",
//               type: "condition",
//               field: "cfs_level",
//               operator: "equals",
//               value: "1",
//               caseSensitive: false,
//             },
//           ],
//           thenValue: "Y29d1",
//         },
//       ],
//       elseValue: "",
//     },
//     refused_hospital: {
//       type: "cascading-advanced",
//       clauses: [
//         {
//           rootLogicType: "AND",
//           rules: [
//             {
//               id: "c1e95ddf-0763-4b69-a43d-6144273594f4",
//               type: "condition",
//               field: "refused_hospital",
//               operator: "contains",
//               value: "true",
//               caseSensitive: false,
//             },
//           ],
//           thenValue: "Xanng",
//         },
//       ],
//       elseValue: "",
//     },
//   },
//   forward_letter: {
//     forwarding_type: "Usergroup",
//     forwarding_to: "KYNOBY Ophthalmology",
//     send_task: false,
//     choose_flag: true,
//     flag_color: "Pink",
//   },
// };