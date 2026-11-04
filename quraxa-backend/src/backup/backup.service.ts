import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';

interface DbConn { host: string; port: string; user: string; password: string; database: string; }

function parseDatabaseUrl(url: string): DbConn {
    const u = new URL(url);
    return {
        host: u.hostname,
        port: u.port || '3306',
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ''),
    };
}

// mysqldump usually isn't on PATH on a plain Windows/XAMPP box — check an
// explicit override first, then the common install locations, then fall
// back to hoping it's on PATH.
function resolveMysqldumpPath(): string {
    if (process.env.MYSQLDUMP_PATH && fs.existsSync(process.env.MYSQLDUMP_PATH)) {
        return process.env.MYSQLDUMP_PATH;
    }
    const candidates = [
        'C:\\xampp\\mysql\\bin\\mysqldump.exe',
        'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
        'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
        'C:\\wamp64\\bin\\mysql\\mysql8.0.31\\bin\\mysqldump.exe',
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return 'mysqldump';
}

@Injectable()
export class BackupService {
    constructor(private prisma: PrismaService) { }

    startDump(): { child: ChildProcessWithoutNullStreams; database: string } {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) throw new InternalServerErrorException('DATABASE_URL is not configured');
        const conn = parseDatabaseUrl(databaseUrl);
        const mysqldumpPath = resolveMysqldumpPath();

        // --set-gtid-purged is MySQL-8-only — MariaDB's mysqldump (e.g. the one
        // bundled with XAMPP) doesn't recognize it and exits immediately with
        // "unknown variable", producing an empty dump. Left out entirely since
        // it's not essential for a one-off backup and this needs to work
        // against both MariaDB and real MySQL servers.
        const args = [
            '--host', conn.host,
            '--port', conn.port,
            '--user', conn.user,
            '--single-transaction',
            '--routines',
            '--triggers',
            conn.database,
        ];

        // Password passed via env var (MYSQL_PWD) rather than argv, so it
        // never shows up in a process listing.
        const child = spawn(mysqldumpPath, args, {
            env: { ...process.env, MYSQL_PWD: conn.password },
        });

        return { child, database: conn.database };
    }

    async logExport(userId: bigint, database: string, ip?: string) {
        await this.prisma.audit_logs.create({
            data: {
                user_id: userId, action: 'SYSTEM_BACKUP_EXPORTED', entity_type: 'database', entity_id: null,
                new_values: JSON.stringify({ database }), ip_address: ip ?? null,
            },
        });
    }
}
