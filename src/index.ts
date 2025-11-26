import { loadEntity } from "#graph/loader";

const entity = await loadEntity("./test/fixtures/sample-graph/entities/user.yaml");
console.log("Loaded entity:", entity.name);
console.log("Fields:", entity.fields.map(f => f.name).join(", "));
