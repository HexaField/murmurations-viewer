import { type FromSchema } from "json-schema-to-ts";
import organizationsSchema from "../../schemas/organizations_schema-v1.0.0";
import peopleSchema from "../../schemas/people_schema-v0.1.0";

export type Organization = FromSchema<typeof organizationsSchema>;

export type Person = FromSchema<typeof peopleSchema>;

export type Project = Organization;

// const ajv = new Ajv({ allErrors: true, strict: false });

// export const validateOrganization = ajv.compile(organizationsSchema);
// export const validatePerson = ajv.compile(peopleSchema);

export const Schemas = {
  organizations: organizationsSchema,
  people: peopleSchema,
};

export const WWW_orgs: Organization[] = [
  {
    name: "Coasys",
    linked_schemas: [],
    relationships: [],
  },
];

export const WWW_projects: Project[] = [];
export const WWW_people: Person[] = [];
