import sqlite3 from 'sqlite3';
import { hashPassword } from './lib/auth';

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    }
});

const run = (query: string, params: any[] = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
};

const get = (query: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

const main = async () => {
    try {
        console.log('Seeding database...');
        
        const adminPass = hashPassword('admin@123');
        const setterPass = hashPassword('setter@123');
        const solverPass = hashPassword('solver@123');

        await run(`INSERT OR IGNORE INTO user (name, email, password, role) VALUES (?, ?, ?, ?)`, ['Admin', 'admin@arX.com', adminPass, 'admin']);
        await run(`INSERT OR IGNORE INTO user (name, email, password, role) VALUES (?, ?, ?, ?)`, ['Setter', 'setter@arX.com', setterPass, 'setter']);
        await run(`INSERT OR IGNORE INTO user (name, email, password, role) VALUES (?, ?, ?, ?)`, ['Solver', 'solver@arX.com', solverPass, 'solver']);

        const adminUser = await get(`SELECT id FROM user WHERE email = ?`, ['admin@arX.com']);
        const setterUser = await get(`SELECT id FROM user WHERE email = ?`, ['setter@arX.com']);

        if (adminUser && setterUser) {
            await run(`INSERT OR IGNORE INTO setter (email, added_by, slug) VALUES (?, ?, ?)`, 
                ['admin@arX.com', adminUser.id, 'admin']);

            await run(`INSERT OR IGNORE INTO setter (email, added_by, slug) VALUES (?, ?, ?)`, 
                ['setter@arX.com', adminUser.id, 'setter']);

            await run(`INSERT OR IGNORE INTO problem (title, slug, statement, setter_id, time_limit_ms, memory_limit_kb) VALUES (?, ?, ?, ?, ?, ?)`, 
                ['Two Sum', 'two-sum', 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.', setterUser.id, 1024, 262144]);
                
            await run(`INSERT OR IGNORE INTO problem (title, slug, statement, setter_id, time_limit_ms, memory_limit_kb) VALUES (?, ?, ?, ?, ?, ?)`, 
                ['Three Sum', 'three-sum', 'Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0.', setterUser.id, 2048, 262144]);

            await run(`INSERT OR IGNORE INTO problem (title, slug, statement, setter_id, time_limit_ms, memory_limit_kb) VALUES (?, ?, ?, ?, ?, ?)`, 
                ['Four Sum', 'four-sum', 'Given an array nums of n integers, return an array of all the unique quadruplets [nums[a], nums[b], nums[c], nums[d]] such that nums[a] + nums[b] + nums[c] + nums[d] == target.', setterUser.id, 2048, 262144]);

            const twoSum = await get(`SELECT id FROM problem WHERE slug = ?`, ['two-sum']);
            const threeSum = await get(`SELECT id FROM problem WHERE slug = ?`, ['three-sum']);
            const fourSum = await get(`SELECT id FROM problem WHERE slug = ?`, ['four-sum']);

            if (twoSum) {
                await run(`INSERT OR IGNORE INTO testcase (problem_id, input_data, output_data, is_sample) VALUES (?, ?, ?, ?)`, [twoSum.id, '4\n2 7 11 15\n9', '0 1', true]);
                await run(`INSERT OR IGNORE INTO testcase (problem_id, input_data, output_data, is_sample) VALUES (?, ?, ?, ?)`, [twoSum.id, '3\n3 2 4\n6', '1 2', false]);
            }
            if (threeSum) {
                await run(`INSERT OR IGNORE INTO testcase (problem_id, input_data, output_data, is_sample) VALUES (?, ?, ?, ?)`, [threeSum.id, '6\n-1 0 1 2 -1 -4', '-1 -1 2\n-1 0 1', true]);
                await run(`INSERT OR IGNORE INTO testcase (problem_id, input_data, output_data, is_sample) VALUES (?, ?, ?, ?)`, [threeSum.id, '3\n0 1 1', '', false]);
            }
            if (fourSum) {
                await run(`INSERT OR IGNORE INTO testcase (problem_id, input_data, output_data, is_sample) VALUES (?, ?, ?, ?)`, [fourSum.id, '6\n1 0 -1 0 -2 2\n0', '-2 -1 1 2\n-2 0 0 2\n-1 0 0 1', true]);
                await run(`INSERT OR IGNORE INTO testcase (problem_id, input_data, output_data, is_sample) VALUES (?, ?, ?, ?)`, [fourSum.id, '5\n2 2 2 2 2\n8', '2 2 2 2', false]);
            }
        }

        console.log('Database seeded successfully.');
        db.close();
    } catch (err) {
        console.error('Error seeding database:', err);
        process.exit(1);
    }
};

main();
