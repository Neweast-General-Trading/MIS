import { Module } from '@nestjs/common';

import { SqlEmpMasterService } from './sql-emp-master.service';

@Module({
  providers: [SqlEmpMasterService],
  exports: [SqlEmpMasterService],
})
export class SqlModule {}
