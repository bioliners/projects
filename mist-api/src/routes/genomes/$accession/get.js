'use strict';

module.exports = function(app, middlewares, routeMiddlewares) {
  const models = app.get('models');
  const helper = app.get('lib').RouteHelper.for(models.Genome);

  return [
    middlewares.parseCriteria(models.Genome, {
      accessibleModels: [
        models.WorkerModule,
        models.Component,
        models.BioSample,
      ],
    }),
    helper.findHandler('accession', 'version'),
  ];
};

module.exports.docs = function(modelExamples) {
  return {
    name: 'Fetch Genome',
    description: 'Returns a single genome',
    example: {
      request: {
        parameters: {
          accession: modelExamples.Genome.version,
        },
      },
      response: {
        body: modelExamples.Genome,
      },
    },
  };
};
