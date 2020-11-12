'use strict';

module.exports = function(Sequelize, models, extras) {
  const fields = {
    gene_id: extras.requiredPositiveInteger(),
    database: extras.requiredText(),
    database_id: extras.requiredText(),
  };

  return {
    fields,
    params: {
      timestamps: false,
    },
  };
};
