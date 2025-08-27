// src/db/entities/Colaborador.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'colaboradores' })
export class Colaborador {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  matricula!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  empresa!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  cargo!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  sindicato!: string | null;

  @Column({ type: 'date', nullable: true })
  data_admissao!: string | null;

  @Column({ type: 'date', nullable: true })
  data_desligamento!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  situacao!: string | null;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  elegivel_beneficio!: boolean;

  @Column({ type: 'json', nullable: true })
  motivo_inelegibilidade!: any | null;
}



