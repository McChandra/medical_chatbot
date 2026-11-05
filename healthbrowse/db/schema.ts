import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,primaryKey} from 'drizzle-orm/sqlite-core';
export const accounts=sqliteTable('hb_accounts',{
 userId:text('user_id').primaryKey(),displayName:text('display_name').notNull().default(''),
 saveChats:integer('save_chats').notNull().default(1),saveHistory:integer('save_history').notNull().default(0),
 readingMode:text('reading_mode').notNull().default('General reader'),theme:text('theme').notNull().default('system'),
 historyEpoch:integer('history_epoch').notNull().default(0),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});
export const chats=sqliteTable('hb_chats',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.userId,{onDelete:'cascade'}),
 title:text('title').notNull(),topic:text('topic').notNull(),readingMode:text('reading_mode').notNull(),
 createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('hb_chats_owner_time').on(t.userId,t.updatedAt)]);
export const turns=sqliteTable('hb_chat_turns',{
 id:text('id').primaryKey(),chatId:text('chat_id').notNull().references(()=>chats.id,{onDelete:'cascade'}),
 turnJson:text('turn_json').notNull(),createdAt:text('created_at').notNull()
},t=>[index('hb_turns_chat_time').on(t.chatId,t.createdAt)]);
export const activity=sqliteTable('hb_research_history',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.userId,{onDelete:'cascade'}),
 topic:text('topic').notNull(),kind:text('kind').notNull(),section:integer('section').notNull(),createdAt:text('created_at').notNull()
},t=>[index('hb_activity_owner_time').on(t.userId,t.createdAt)]);
export const bookmarks=sqliteTable('hb_bookmarks',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>accounts.userId,{onDelete:'cascade'}),
 topic:text('topic').notNull(),kind:text('kind').notNull(),title:text('title').notNull(),url:text('url').notNull().default(''),createdAt:text('created_at').notNull()
},t=>[index('hb_bookmarks_owner_time').on(t.userId,t.createdAt)]);
