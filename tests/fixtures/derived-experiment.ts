import { experiments, type ExperimentDefinition } from '../../src/laboratory/catalog.ts';

// Manual metadata copy only. The execution entry and every Component are reused.
export const derivedExperiment: ExperimentDefinition = {
  ...structuredClone(experiments[0]), id:'fixture-marker-review', title:'Fixture Marker Review', version:'0.1-fixture',
  derived_from:{id:experiments[0].id,version:experiments[0].version},
};
