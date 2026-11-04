import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
    constructor(private backupService: BackupService) { }

    // Streams a full mysqldump straight through to the response — no
    // intermediate file left on disk, and it never buffers the whole
    // (potentially large) dump in memory.
    @Get('export')
    @RequirePermissions('system.backup')
    async export(@Req() req: any, @Res() res: Response) {
        const { child, database } = this.backupService.startDump();

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="${database}-backup-${stamp}.sql"`);

        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

        child.on('error', (err) => {
            if (!res.headersSent) {
                res.status(500);
                res.setHeader('Content-Type', 'application/json');
            }
            res.end(JSON.stringify({
                message: err.message.includes('ENOENT')
                    ? 'mysqldump was not found on this server. Set MYSQLDUMP_PATH in the backend .env to its full path.'
                    : 'Backup failed to start',
            }));
        });

        child.on('close', (code) => {
            if (code === 0) {
                this.backupService.logExport(BigInt(req.user.userId), database, req.ip).catch(() => { });
            } else if (!res.writableEnded) {
                res.end(`\n-- mysqldump exited with code ${code}: ${stderr}`);
            }
        });

        child.stdout.pipe(res);
    }
}
