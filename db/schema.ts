import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';

// Metadata only. Never add original/generated images, faces or persistent person IDs.
export const xtorePassages=sqliteTable('xtore_passages',{
  id:text('id').primaryKey(),
  kind:text('kind').notNull(),
  at:integer('at').notNull(),
  source:text('source').notNull(),
},table=>[index('xtore_passages_at').on(table.at)]);
